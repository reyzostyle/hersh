import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { loadChannelScan, channelScanBlock } from '../_shared/channel-scan.ts';
import { watchVideo } from '../_shared/analyze-video.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Reads one competitor video properly: pulls the transcript and has the model
// say what the idea actually is and how it would work on this creator's
// channel. One credit, charged once per video, and only when a person asked
// for this specific one.
//
// This is the half of the old fetch-competitor-ideas that cost money. Splitting
// it out is what lets the pool be effectively unlimited: discovery is now free
// arithmetic over public data, and the model only ever runs on something a
// human already picked out of the feed.

function stripDashes(s: unknown): unknown {
  if (typeof s === 'string') return s.replace(/[—–]/g, '-');
  if (Array.isArray(s)) return s.map(stripDashes);
  if (s && typeof s === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(s as object)) out[k] = stripDashes((s as Record<string, unknown>)[k]);
    return out;
  }
  return s;
}

async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const events = data.events || [];
    return events
      .filter((e: any) => e.segs)
      .map((e: any) => e.segs.map((s: any) => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

// Reads the video one of two ways, and the choice is not about cost.
//
// A transcript is free and enough most of the time. But plenty of Shorts have
// no captions at all - no speech, a non-English upload, an author who never
// enabled them - and the old path still charged a full credit to write a
// "breakdown" from a title and a view count. That is a worse answer at the same
// price, and nothing on screen said so. When there is no transcript the model
// watches the video instead: it costs us roughly ten times more on those, and
// the user pays the same one credit, because a predictable price is worth more
// than the margin on the minority of videos that have no captions.
async function extractConceptAndAdapt(
  videoId: string,
  title: string,
  views: number,
  outlierScore: number | null,
  transcript: string,
  profileBlock: string,
  scanBlock: string,
  niche: string,
): Promise<{ concept: string; adapted_idea: string }> {
  const prompt = `You analyze competitor YouTube Shorts and extract the core concept, then adapt it for a different creator.

${profileBlock}${scanBlock}

Competitor video:
Title: ${title}
Views: ${views.toLocaleString()}
Performance: ${outlierScore ? `${outlierScore}x this channel's usual views per day - it outperformed their baseline` : 'N/A'}
${transcript ? `Transcript: ${transcript}` : 'This video has no captions, so you are watching it instead. Read the visuals: what is on screen in the opening second, where the cuts land, what any text overlay says.'}

Extract:
1. CONCEPT: The core idea/topic of this video in 2-3 sentences. What's the angle? Why does it work for their audience?
2. ADAPTED_IDEA: How THIS creator could use the same concept - same proven format, their subject matter. 2-3 sentences. Name the actual topic they would cover, in the register their own titles are written in. If their uploads are listed above, that list is what "their channel" means; ${niche ? `the niche they gave is "${niche}"` : 'they have not filled in a niche, so work entirely from what they publish'}.

Focus on what made this specific video out-perform the channel's other uploads, not on generic advice. Never open with a hedge about not knowing their niche - you have their uploads, use them.

Rules:
- Never use em-dash or en-dash. Only regular hyphen (-).
- Respond with JSON only.

{
  "concept": "...",
  "adapted_idea": "..."
}`;

  const content = transcript
    ? await callLLM(prompt, { maxTokens: 800 })
    : await watchVideo(
        { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/mp4' },
        prompt,
        { maxTokens: 4096 },
      );

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        concept: String(stripDashes(parsed.concept) || ''),
        adapted_idea: String(stripDashes(parsed.adapted_idea) || ''),
      };
    }
    throw new Error('No JSON in response');
  } catch {
    return { concept: content.substring(0, 300).replace(/[—–]/g, '-'), adapted_idea: '' };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { videoId, adaptForProfile = true } = await req.json();
    if (!videoId || typeof videoId !== 'string') {
      return new Response(JSON.stringify({ error: 'videoId required' }), { status: 400, headers: corsHeaders });
    }

    const { data: profile } = await supabase
      .from('user_tokens').select('plan, channel_niche, channel_description, channel_context, target_audience')
      .eq('user_id', user.id).maybeSingle();
    // No plan gate - the credit pool is the trial. See generate-outline.

    // Already read once. Hand back what is stored rather than charging twice
    // for the same video - a user who dismisses something and later reopens it
    // from the Dismissed tab should not pay again.
    const { data: existing } = await supabase
      .from('competitor_ideas').select('*')
      .eq('user_id', user.id).eq('video_id', videoId).maybeSingle();
    if (existing?.concept) {
      return new Response(JSON.stringify({ success: true, idea: existing, charged: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // The video has to be in the pool of a channel this user tracks. Without
    // this, videoId is an arbitrary string from the browser and the endpoint
    // would happily run the model on anything on YouTube.
    const { data: pooled } = await supabase
      .from('competitor_videos').select('*').eq('video_id', videoId).maybeSingle();
    if (!pooled) {
      return new Response(JSON.stringify({ error: 'That video is not in your feed.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: tracked } = await supabase
      .from('competitor_channels').select('id')
      .eq('user_id', user.id).eq('channel_id', pooled.channel_id).maybeSingle();
    if (!tracked) {
      return new Response(JSON.stringify({ error: 'That video is not in your feed.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isAdmin = user.email === 'reyzostyle@gmail.com';
    const creditStatus = await loadCreditStatus(supabase, user.id);
    const cost = CREDIT_COSTS.competitor_idea;
    if (!canAfford(creditStatus, cost, isAdmin)) {
      return new Response(JSON.stringify({ error: 'limit_reached' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Two sources, and they are not the same thing. The four profile fields are
    // what the creator told us; the scan is what their channel actually ships.
    // With the toggle off, neither is sent and the read is a plain one.
    const niche = adaptForProfile ? (profile?.channel_niche || '') : '';
    const profileBlock = adaptForProfile
      ? `## What they told us about their channel
Niche: ${profile?.channel_niche || 'not set'}
Description: ${profile?.channel_description || 'not set'}
Audience: ${profile?.target_audience || 'not set'}
Extra context: ${profile?.channel_context || 'not set'}`
      : '';
    const scanBlock = adaptForProfile ? channelScanBlock(await loadChannelScan(supabase, user.id)) : '';

    const transcript = await fetchTranscript(videoId);
    const { concept, adapted_idea } = await extractConceptAndAdapt(
      videoId, pooled.title || '', pooled.views || 0, pooled.outlier_score, transcript,
      profileBlock, scanBlock, niche,
    );

    // Upsert, not insert: the row may already exist as the record of a save or
    // a dismissal made before anything was read. `liked` is deliberately not in
    // the payload, so enriching never overwrites the decision already on it.
    const { data: idea, error: upsertError } = await supabase
      .from('competitor_ideas')
      .upsert({
        user_id: user.id,
        channel_id: pooled.channel_id,
        channel_name: pooled.channel_name,
        video_id: videoId,
        video_title: pooled.title,
        video_views: pooled.views,
        video_published_at: pooled.published_at,
        outlier_score: pooled.outlier_score,
        concept,
        adapted_idea,
      }, { onConflict: 'user_id,video_id' })
      .select()
      .single();
    if (upsertError) throw upsertError;

    await spendCredits(supabase, user.id, creditStatus, cost);

    return new Response(JSON.stringify({ success: true, idea, charged: cost }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[enrich-competitor-video]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
