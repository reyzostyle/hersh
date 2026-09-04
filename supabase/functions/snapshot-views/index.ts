import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-secret',
};

// How long a video is worth sampling. Views keep arriving after a week, but not
// fast enough for the rate to say anything, and every id in the batch costs
// quota that a video published an hour ago has better use for.
const FRESH_DAYS = 7;
// videos.list takes up to 50 ids and costs one quota unit however many are
// sent, so the batch size IS the cost control: 500 videos is 10 units a run.
const BATCH = 50;
const MAX_VIDEOS = 500;

// Writes down what every recent video has right now.
//
// This exists because the number cannot be recovered later. The YouTube
// Analytics API stops at a day dimension, so "how fast did it move in its first
// three hours" is answerable only if someone wrote it down during those hours.
// Nothing did, until this.
//
// Called on a schedule, not by a person: the secret header is the same pattern
// update-knowledge-base uses. A run is idempotent in the sense that matters -
// running it twice in a minute writes two samples a minute apart, which is
// harmless, and the rate function ignores gaps under ten minutes.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  if (req.headers.get('x-admin-secret') !== Deno.env.get('ADMIN_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured');

    const since = new Date(Date.now() - FRESH_DAYS * 86400_000).toISOString();

    // Both sides of the product, in one batch. The creator's own uploads are
    // what "did mine start normally" is asked about; the competitor pool is
    // what normal is measured against. Sampling only one of them would leave
    // the comparison with nothing on the other side of it.
    const [mine, theirs] = await Promise.all([
      supabase.from('videos').select('video_id').gte('published_at', since),
      supabase.from('competitor_videos').select('video_id').gte('published_at', since),
    ]);

    const ids = [...new Set([
      ...(mine.data ?? []).map(r => r.video_id),
      ...(theirs.data ?? []).map(r => r.video_id),
    ].filter(Boolean))].slice(0, MAX_VIDEOS);

    if (!ids.length) {
      return new Response(JSON.stringify({ sampled: 0, note: 'nothing recent to sample' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // One timestamp for the whole run rather than per batch. Samples taken
    // seconds apart are the same measurement, and a shared captured_at keeps
    // "everything measured at 14:00" a single comparable column later.
    const capturedAt = new Date().toISOString();
    const rows: { video_id: string; captured_at: string; views: number; likes: number | null; comments: number | null }[] = [];
    let missing = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(',')}&key=${apiKey}`,
      );
      if (!res.ok) {
        console.error(`[snapshot-views] YouTube ${res.status}: ${await res.text()}`);
        // Quota is shared with the rest of the product, so a refusal stops the
        // run instead of burning the remainder against the same wall.
        break;
      }
      const data = await res.json();
      // A private, deleted or region-blocked video simply is not in the
      // response. Counted, not written: a missing row is honest, a zero is not.
      missing += chunk.length - (data.items?.length ?? 0);

      for (const item of data.items ?? []) {
        const s = item.statistics ?? {};
        if (s.viewCount == null) continue;
        rows.push({
          video_id: item.id,
          captured_at: capturedAt,
          views: Number(s.viewCount),
          likes: s.likeCount != null ? Number(s.likeCount) : null,
          comments: s.commentCount != null ? Number(s.commentCount) : null,
        });
      }
    }

    if (rows.length) {
      // upsert, not insert: a retry of the same run carries the same
      // captured_at and would otherwise collide on the primary key.
      const { error } = await supabase
        .from('video_snapshots')
        .upsert(rows, { onConflict: 'video_id,captured_at' });
      if (error) throw error;
    }

    console.log(`[snapshot-views] asked ${ids.length}, wrote ${rows.length}, missing ${missing}`);
    return new Response(
      JSON.stringify({ sampled: rows.length, asked: ids.length, missing, captured_at: capturedAt }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[snapshot-views]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
