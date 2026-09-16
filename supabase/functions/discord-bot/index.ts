import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { analyzeVideo } from '../_shared/analyze-video.ts';
import { callLLM } from '../_shared/llm.ts';

// The brain behind the Discord bot (discord-bot/ at the repo root).
//
// The bot itself is only a Discord connection: it has no model keys and no
// prompts. Everything it says comes from here, so the review a server member
// gets is the exact review the app gives - same analyzeVideo, same knowledge
// base, same Shorts-only rule - and switching the model is still one
// `supabase secrets set` away.
//
// Called by one caller, the bot, with a shared secret. No user token, no
// credits: the bot keeps its own per-member daily limits.

const MAX_SHORT_SECONDS = 180;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface ChatLine { author: string; text: string; bot?: boolean }

// The voice. Modeled on how people talk in a creator Discord: lowercase, direct,
// no essay. The one thing it does differently from the bots people are used to
// is that it reads the conversation around the question, so "how common is
// this?" is answered about the thing being discussed instead of with "what do
// you mean by this".
const SYSTEM = `you are chumoku, the ai in the chumoku discord. the server is full of people who make youtube shorts, tiktoks and reels. you have watched thousands of shorts and you know why they hold people or lose them, how monetization and policy strikes work, how the algorithm treats reuploads and clips, and what actually grows a channel.

how you talk:
- lowercase, casual, like a smart friend in the server. no greetings, no "great question", no sign-offs.
- short. a few sentences, or a tight list when there are options. go longer only when the question really needs it. hard cap around 1500 characters.
- concrete. the actual edit, the actual number, the actual next step. never "consider improving your content".
- honest. if you can't know for sure (you can't see their studio, their strike, their video), say so in half a sentence and then give the most likely causes in order anyway. never invent stats or quote youtube policy text you are not sure of.
- no em dashes. use a plain hyphen or a new sentence.
- discord markdown is fine: **bold** sparingly, bullet lists. no headers.

context:
- you get the recent messages from the channel before the question. use them. if they say "this" or "it", work out what they mean from those messages. only ask for more context if the messages really don't say.
- messages marked (you) are your own earlier replies.
- if someone asks for a video review, tell them to drop the youtube shorts link in the channel and you'll watch it.
- chumoku is the app (chumoku.co): it watches a short and gives timestamped fixes, and with a connected channel it reads the real retention curve. mention it only when it genuinely helps the question, never as an ad.`;

function contextBlock(lines: ChatLine[]): string {
  if (!lines.length) return '';
  return `recent messages in the channel, oldest first:\n${lines
    .map(l => `${l.bot ? '(you)' : l.author}: ${l.text}`)
    .join('\n')}\n\n`;
}

async function videoDuration(videoId: string): Promise<{ seconds: number | null; title: string | null }> {
  const key = Deno.env.get('YOUTUBE_API_KEY');
  if (!key) return { seconds: null, title: null };
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails,statistics&key=${key}`);
    if (!res.ok) { console.log('[discord-bot] youtube api', res.status, await res.text()); return { seconds: null, title: null }; }
    const item = (await res.json()).items?.[0];
    if (!item) return { seconds: null, title: null };
    const m = (item.contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const seconds = m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : null;
    return { seconds, title: item.snippet?.title ?? null };
  } catch {
    return { seconds: null, title: null };
  }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-bot-secret') !== Deno.env.get('DISCORD_BOT_SECRET') || !Deno.env.get('DISCORD_BOT_SECRET')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const context: ChatLine[] = Array.isArray(body.context) ? body.context.slice(-12) : [];
    const question = String(body.question ?? '').slice(0, 2000);

    if (body.kind === 'ask') {
      if (!question.trim()) return json({ error: 'Empty question' }, 400);
      const answer = await callLLM(`${contextBlock(context)}${body.author ?? 'someone'} asks: ${question}`, {
        system: SYSTEM,
        maxTokens: 900,
      });
      return json({ answer: answer.replace(/[—–]/g, '-').trim() });
    }

    if (body.kind === 'analyze') {
      const videoId = String(body.videoId ?? '');
      if (!/^[\w-]{11}$/.test(videoId)) return json({ error: 'bad_video' }, 400);

      const { seconds, title } = await videoDuration(videoId);
      console.log(`[discord-bot] analyze ${videoId}: ${seconds ?? 'unknown'}s`);
      if (seconds && seconds > MAX_SHORT_SECONDS) return json({ error: 'not_short' }, 400);

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      // Always someone's video with no connected channel behind it: no brain,
      // no retention. The question that came with the link is context, the
      // same as in the app.
      const analysis = await analyzeVideo(
        { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/mp4' },
        { video_id: videoId, title, duration: seconds, views: null, likes_count: null, is_external: true },
        {},
        question,
        supabase,
      );

      // A question beside the link gets answered from the review, in the chat
      // voice, rather than being left for the member to ask again.
      let answer: string | null = null;
      if (question.trim()) {
        const review = JSON.stringify({
          score: analysis.overall_score,
          assessment: analysis.overall_assessment,
          strong_spots: analysis.strong_spots,
          weak_spots: analysis.weak_spots,
          transcript: analysis.transcript,
          timeline: analysis.timeline,
        });
        answer = (await callLLM(
          `you just watched this short and wrote this review:\n${review}\n\n${body.author ?? 'someone'} sent the link with: ${question}\n\nanswer what they asked, from what you saw. the review is posted separately, so don't repeat the score or restate the fixes.`,
          { system: SYSTEM, maxTokens: 700 },
        )).replace(/[—–]/g, '-').trim();
      }

      return json({
        title,
        score: analysis.overall_score,
        assessment: analysis.overall_assessment,
        strong: (analysis.strong_spots ?? []).slice(0, 2),
        weak: (analysis.weak_spots ?? []).slice(0, 3),
        answer,
      });
    }

    return json({ error: 'Unknown kind' }, 400);
  } catch (e) {
    console.error('[discord-bot]', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
