import { languageRule, loadLanguage } from '../_shared/language.ts';
import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { loadChannelScan, channelScanBlock } from '../_shared/channel-scan.ts';
import { loadBrain, brainBlock } from '../_shared/brain.ts';
import { fetchTranscript, extractConceptAndAdapt } from '../_shared/steal.ts';

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

// Reads one competitor video properly: pulls the transcript and has the model
// say what the idea actually is and how it would work on this creator's
// channel. One credit, charged once per video, and only when a person asked
// for this specific one.
//
// This is the half of the old fetch-competitor-ideas that cost money. Splitting
// it out is what lets the pool be effectively unlimited: discovery is now free
// arithmetic over public data, and the model only ever runs on something a
// human already picked out of the feed.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }

    const { videoId, adaptForProfile = true } = await req.json();
    if (!videoId || typeof videoId !== 'string') {
      return new Response(JSON.stringify({ error: 'videoId required' }), { status: 400, headers: CORS });
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
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // The video has to be one this user was shown: in the pool of a channel
    // they track, or already a row of theirs. Without this, videoId is an
    // arbitrary string from the browser and the endpoint would happily run the
    // model on anything on YouTube.
    //
    // The second case is the daily drop (2026-10-12): most of its ideas come
    // from channels a niche search found, which the user does not track, so
    // "My angle" on a swiped card failed with "not in your feed". Those rows
    // are written server-side by daily-ideas, so their existence is the proof.
    const { data: inPool } = await supabase
      .from('competitor_videos').select('*').eq('video_id', videoId).maybeSingle();
    let allowed = !!existing;
    if (!allowed && inPool) {
      const { data: tracked } = await supabase
        .from('competitor_channels').select('id')
        .eq('user_id', user.id).eq('channel_id', inPool.channel_id).maybeSingle();
      allowed = !!tracked;
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'That video is not in your feed.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    // The pool row when it is still there; the idea row's copy when the pool
    // has since been pruned.
    const pooled = inPool ?? {
      channel_id: existing.channel_id,
      channel_name: existing.channel_name,
      title: existing.video_title,
      views: existing.video_views,
      published_at: existing.video_published_at,
      outlier_score: existing.outlier_score,
    };

    const isAdmin = user.email === 'reyzostyle@gmail.com';
    const creditStatus = await loadCreditStatus(supabase, user.id);
    const cost = CREDIT_COSTS.competitor_idea;
    if (!canAfford(creditStatus, cost, isAdmin)) {
      return new Response(JSON.stringify({ error: 'limit_reached' }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Two sources, and they are not the same thing. The brain is the model's
    // own read of who they are - niche, format, voice, and the rules for
    // remaking someone else's video here; the scan is the raw evidence it was
    // read from, kept because a title is worth more than a description of
    // their titles. With the toggle off, neither is sent and the read is a
    // plain one.
    //
    // The four hand-typed boxes are the fallback, for accounts that have not
    // built a brain yet. They were the only source until 2026-09-09, and they
    // were usually empty.
    const brain = adaptForProfile ? await loadBrain(supabase, user.id) : null;
    const lang = languageRule(await loadLanguage(supabase, user.id));
    const niche = adaptForProfile ? (brain?.niche || profile?.channel_niche || '') : '';
    const profileBlock = !adaptForProfile
      ? ''
      : brain
      ? brainBlock(brain)
      : `## What they told us about their channel
Niche: ${profile?.channel_niche || 'not set'}
Description: ${profile?.channel_description || 'not set'}
Audience: ${profile?.target_audience || 'not set'}
Extra context: ${profile?.channel_context || 'not set'}`;
    const scanBlock = adaptForProfile ? channelScanBlock(await loadChannelScan(supabase, user.id)) : '';

    const transcript = await fetchTranscript(videoId);
    const { concept, adapted_idea } = await extractConceptAndAdapt(
      videoId, pooled.title || '', pooled.views || 0, pooled.outlier_score, transcript,
      profileBlock + lang, scanBlock, niche,
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
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[enrich-competitor-video]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
