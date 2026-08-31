// A read of the creator's OWN channel, cached on user_tokens.
//
// Every prompt in the product that adapts something "for your channel" was
// working from four hand-typed fields. People describe the channel they intend
// to run; the uploads show the one they are actually running, and the gap
// between those is exactly what a competitor angle needs to land. This fetches
// the second half: the channel description Google holds, and the titles and
// view counts of the last uploads.
//
// Three YouTube reads, refreshed weekly, shared by whatever asks for it - not
// re-fetched per request. It never throws: a channel that is not connected, an
// expired grant or a YouTube outage all mean "no scan", and callers fall back
// to the typed profile.

const SCAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_VIDEOS = 20;

export interface ChannelScan {
  channelTitle: string;
  description: string;
  subscribers: number | null;
  videos: { title: string; views: number; publishedAt: string }[];
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('YOUTUBE_CLIENT_ID')!,
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

// deno-lint-ignore no-explicit-any
async function buildScan(supabase: any, userId: string, row: any): Promise<ChannelScan | null> {
  if (!row?.access_token) return null;

  let accessToken = row.access_token as string;
  const expiry = row.token_expiry ? new Date(row.token_expiry) : new Date(0);
  if (expiry < new Date() && row.refresh_token) {
    accessToken = await refreshAccessToken(row.refresh_token);
    const next = new Date();
    next.setSeconds(next.getSeconds() + 3600);
    await supabase.from('user_tokens')
      .update({ access_token: accessToken, token_expiry: next.toISOString() })
      .eq('user_id', userId);
  }

  // mine=true needs the user's grant; the two calls after it are public data,
  // so they go through the API key and never depend on the scope.
  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!chRes.ok) throw new Error(`channels?mine failed: ${await chRes.text()}`);
  const ch = (await chRes.json()).items?.[0];
  if (!ch) return null;

  const scan: ChannelScan = {
    channelTitle: ch.snippet?.title || '',
    description: ch.snippet?.description || '',
    subscribers: ch.statistics?.subscriberCount ? Number(ch.statistics.subscriberCount) : null,
    videos: [],
  };

  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (uploads && apiKey) {
    const plRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploads}&part=contentDetails&maxResults=${SCAN_VIDEOS}&key=${apiKey}`);
    if (plRes.ok) {
      const ids = ((await plRes.json()).items || [])
        .map((i: any) => i.contentDetails?.videoId).filter(Boolean).slice(0, SCAN_VIDEOS);
      if (ids.length) {
        const vRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?id=${ids.join(',')}&part=snippet,statistics&key=${apiKey}`);
        if (vRes.ok) {
          scan.videos = ((await vRes.json()).items || []).map((v: any) => ({
            title: v.snippet?.title || '',
            views: parseInt(v.statistics?.viewCount || '0', 10),
            publishedAt: v.snippet?.publishedAt || '',
          }));
        }
      }
    }
  }

  await supabase.from('user_tokens')
    .update({ channel_scan: scan, channel_scan_at: new Date().toISOString() })
    .eq('user_id', userId);

  return scan;
}

// deno-lint-ignore no-explicit-any
export async function loadChannelScan(supabase: any, userId: string): Promise<ChannelScan | null> {
  const { data: row } = await supabase
    .from('user_tokens')
    .select('access_token, refresh_token, token_expiry, channel_scan, channel_scan_at')
    .eq('user_id', userId)
    .maybeSingle();

  const cachedAt = row?.channel_scan_at ? new Date(row.channel_scan_at).getTime() : 0;
  if (row?.channel_scan && Date.now() - cachedAt < SCAN_TTL_MS) {
    return row.channel_scan as ChannelScan;
  }

  try {
    return await buildScan(supabase, userId, row);
  } catch (e) {
    console.error('[channel-scan]', e);
    // A stale scan beats no scan: titles from last month still describe the
    // channel better than nothing does.
    return (row?.channel_scan as ChannelScan) ?? null;
  }
}

// The prompt block. Kept here so every caller describes the creator's channel
// the same way, and so the instruction about which source wins travels with the
// data instead of being re-invented in each prompt.
export function channelScanBlock(scan: ChannelScan | null): string {
  if (!scan) return '';
  const titles = scan.videos.slice(0, SCAN_VIDEOS)
    .map(v => `- ${v.title} (${v.views.toLocaleString()} views)`)
    .join('\n');
  return `
## What their channel actually publishes
Channel: ${scan.channelTitle}${scan.subscribers != null ? ` (${scan.subscribers.toLocaleString()} subscribers)` : ''}
Their own description: ${scan.description ? scan.description.slice(0, 600) : 'not set'}
${titles ? `Their last ${scan.videos.length} uploads, newest first:\n${titles}` : 'No uploads found.'}

Read this before the profile above it. The profile is what they told us; this is
what they ship. Take the format, the voice and the subject matter from these
titles, and take intent and direction from the profile. Where the two disagree,
the uploads are the evidence. Note the view range too: an idea that only works
at a scale they are nowhere near is not useful to them.`;
}
