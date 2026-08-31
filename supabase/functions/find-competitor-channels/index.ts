import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadChannelScan } from '../_shared/channel-scan.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Suggests competitor channels instead of making someone go and find five
// YouTube URLs by hand before the tab does anything at all.
//
// It does NOT search for channels. YouTube's search.list can be told to return
// channels, but it matches them on channel titles and descriptions - text
// written by the owner, about themselves - so you get whoever described
// themselves in your words, not whoever is winning in your subject. Searching
// for VIDEOS and taking the channels behind the winners costs the same quota
// and answers the question actually being asked: who is already performing on
// this topic. A channel that shows up three times in the top fifty is a
// stronger signal than any self-description.
//
// Charged nothing, rate-limited hard: see the migration for why quota, not
// model cost, is the binding constraint.

const SEARCH_WINDOW_DAYS = 180;
const FIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_SUGGESTIONS = 10;

// deno-lint-ignore no-explicit-any
async function buildQuery(scan: any, niche: string, description: string): Promise<string> {
  const titles = (scan?.videos ?? []).slice(0, 20).map((v: any) => `- ${v.title}`).join('\n');

  // Raw titles make terrible queries: they are full of hashtags, emoji and
  // in-jokes. One cheap call turns them into the phrase a viewer would type.
  const prompt = `A creator wants to find other YouTube channels making short-form videos on their subject.

What they say their channel is about:
Niche: ${niche || 'not set'}
Description: ${description || 'not set'}

The titles of their own recent uploads:
${titles || 'none available'}

Write ONE YouTube search phrase in ENGLISH that would surface popular Shorts on the same subject, made by other people. Two to five words, the words an English-speaking viewer would actually type, no hashtags, no emoji, no channel names, no quotes. Reply with the phrase and nothing else.`;

  const raw = await callLLM(prompt, { maxTokens: 40 });
  return raw.replace(/["'\n#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const ytApiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!ytApiKey) throw new Error('YouTube API key not configured');

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

    const { data: profile } = await supabase
      .from('user_tokens')
      .select('plan, channel_niche, channel_description, competitor_find_at')
      .eq('user_id', user.id).maybeSingle();

    if ((profile?.plan || 'free') === 'free') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'plus' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isAdmin = user.email === 'reyzostyle@gmail.com';
    const lastFind = profile?.competitor_find_at ? new Date(profile.competitor_find_at).getTime() : 0;
    if (!isAdmin && Date.now() - lastFind < FIND_COOLDOWN_MS) {
      return new Response(JSON.stringify({
        error: 'rate_limited',
        message: 'Auto-find runs once a day. Add a channel by URL in the meantime.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const scan = await loadChannelScan(supabase, user.id);
    const niche = profile?.channel_niche || '';
    const description = profile?.channel_description || '';

    // With no profile and no connected channel there is nothing to search for,
    // and a guess would burn 100 units of quota to return strangers.
    if (!scan?.videos?.length && !niche && !description) {
      return new Response(JSON.stringify({
        error: 'no_profile',
        message: 'Fill in your niche in Settings, or connect your YouTube channel, and this can look for people making the same thing.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const query = await buildQuery(scan, niche, description);
    if (!query) throw new Error('Could not work out what to search for');

    const publishedAfter = new Date(Date.now() - SEARCH_WINDOW_DAYS * 86_400_000).toISOString();
    const searchUrl = `https://www.googleapis.com/youtube/v3/search`
      + `?part=snippet&type=video&videoDuration=short&order=viewCount&maxResults=50`
      + `&relevanceLanguage=en&regionCode=US`
      + `&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&key=${ytApiKey}`;

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`YouTube search failed: ${await searchRes.text()}`);
    const items = (await searchRes.json()).items || [];

    // relevanceLanguage is a hint, not a filter - it happily returned a
    // Portuguese channel for an English query, and that channel then fed the
    // user's feed with videos they cannot read. So the hits are checked against
    // what the videos actually declare. One extra quota unit for all fifty.
    const searchIds = items.map((it: any) => it.id?.videoId).filter(Boolean).slice(0, 50);
    const englishIds = new Set<string>();
    if (searchIds.length) {
      const langRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${searchIds.join(',')}&part=snippet&key=${ytApiKey}`);
      if (langRes.ok) {
        for (const v of (await langRes.json()).items || []) {
          const lang = v.snippet?.defaultAudioLanguage || v.snippet?.defaultLanguage;
          // Unset counts as English, same rule the pool uses.
          if (!lang || String(lang).toLowerCase().startsWith('en')) englishIds.add(v.id);
        }
      }
    }

    // How many of the top fifty a channel owns IS the ranking. One hit is a
    // coincidence; three means they own the subject.
    const hits = new Map<string, number>();
    for (const it of items) {
      const id = it.snippet?.channelId;
      const vid = it.id?.videoId;
      if (!id || (vid && englishIds.size && !englishIds.has(vid))) continue;
      hits.set(id, (hits.get(id) ?? 0) + 1);
    }

    const { data: tracked } = await supabase
      .from('competitor_channels').select('channel_id').eq('user_id', user.id);
    const exclude = new Set((tracked ?? []).map((c: any) => c.channel_id));

    const candidateIds = [...hits.keys()].filter(id => !exclude.has(id)).slice(0, 50);
    if (candidateIds.length === 0) {
      await supabase.from('user_tokens')
        .update({ competitor_find_at: new Date().toISOString() }).eq('user_id', user.id);
      return new Response(JSON.stringify({ success: true, query, channels: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // One more read for the names, avatars and sizes the picker shows.
    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?id=${candidateIds.join(',')}&part=snippet,statistics&key=${ytApiKey}`);
    if (!chRes.ok) throw new Error(`YouTube channels failed: ${await chRes.text()}`);
    const chItems = (await chRes.json()).items || [];

    const ownChannelTitle = (scan?.channelTitle || '').toLowerCase();
    const channels = chItems
      .map((c: any) => ({
        channelId: c.id,
        name: c.snippet?.title || c.id,
        thumbnail: c.snippet?.thumbnails?.default?.url || '',
        subscribers: c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
        hits: hits.get(c.id) ?? 0,
      }))
      // Their own channel turning up as its own competitor is the one result
      // nobody needs.
      .filter((c: any) => c.name.toLowerCase() !== ownChannelTitle)
      .sort((a: any, b: any) => b.hits - a.hits || (b.subscribers ?? 0) - (a.subscribers ?? 0))
      .slice(0, MAX_SUGGESTIONS);

    await supabase.from('user_tokens')
      .update({ competitor_find_at: new Date().toISOString() }).eq('user_id', user.id);

    return new Response(JSON.stringify({ success: true, query, channels }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[find-competitor-channels]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
