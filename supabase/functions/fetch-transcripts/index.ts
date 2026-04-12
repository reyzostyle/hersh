import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  videoIds: string[];
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to refresh access token: ${errText}`);
  }

  const tokens = await tokenResponse.json();
  return tokens.access_token;
}

async function fetchCaptionsViaOfficialAPI(accessToken: string, videoId: string): Promise<string> {
  console.log(`[official-api] Starting for video ${videoId}`);

  const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`;
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  console.log(`[official-api] Caption list status for ${videoId}: ${listResponse.status}`);

  if (!listResponse.ok) {
    const errBody = await listResponse.text();
    console.error(`[official-api] Caption list FAILED for ${videoId}: status=${listResponse.status}, body=${errBody}`);
    return '';
  }

  const listData = await listResponse.json();
  console.log(`[official-api] Caption list for ${videoId}:`, JSON.stringify(listData));

  if (!listData.items || listData.items.length === 0) {
    console.log(`[official-api] No caption tracks for ${videoId}`);
    return '';
  }

  listData.items.forEach((item: any, i: number) => {
    console.log(`[official-api] Track ${i}: id=${item.id}, lang=${item.snippet?.language}, kind=${item.snippet?.trackKind}`);
  });

  const englishTrack = listData.items.find(
    (item: any) => item.snippet?.language === 'en' || item.snippet?.trackKind === 'asr'
  ) || listData.items[0];

  console.log(`[official-api] Selected track: id=${englishTrack.id}, lang=${englishTrack.snippet?.language}, kind=${englishTrack.snippet?.trackKind}`);

  const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${englishTrack.id}?tfmt=srt`;
  const downloadResponse = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  console.log(`[official-api] Caption download status for ${videoId}: ${downloadResponse.status}`);

  if (!downloadResponse.ok) {
    const errBody = await downloadResponse.text();
    console.error(`[official-api] Caption download FAILED for ${videoId}: status=${downloadResponse.status}, body=${errBody}`);
    return '';
  }

  const srtText = await downloadResponse.text();
  console.log(`[official-api] Raw SRT length for ${videoId}: ${srtText.length}`);

  const plainText = srtText
    .replace(/\d+\r?\n/g, '')
    .replace(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\r?\n\r?\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

  console.log(`[official-api] Parsed transcript for ${videoId}, length: ${plainText.length}`);
  return plainText;
}

async function fetchCaptionsViaTimedText(videoId: string): Promise<string> {
  console.log(`[timedtext] Trying for ${videoId}`);

  const urls = [
    `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`,
    `https://www.youtube.com/api/timedtext?lang=en-US&v=${videoId}&fmt=json3`,
    `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&kind=asr&fmt=json3`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; bot)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      console.log(`[timedtext] ${url} → ${response.status}`);

      if (!response.ok) continue;

      const text = await response.text();
      if (!text || text.trim().length === 0) {
        console.log(`[timedtext] Empty response for ${url}`);
        continue;
      }

      try {
        const data = JSON.parse(text);
        if (data.events && data.events.length > 0) {
          const transcript = data.events
            .filter((e: any) => e.segs)
            .map((e: any) => e.segs.map((s: any) => s.utf8 || '').join(''))
            .join(' ')
            .replace(/\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (transcript.length > 0) {
            console.log(`[timedtext] Success for ${videoId}, length: ${transcript.length}`);
            return transcript;
          }
        } else {
          console.log(`[timedtext] No events in response for ${url}`);
        }
      } catch (parseErr) {
        console.log(`[timedtext] JSON parse error for ${url}: ${parseErr}`);
      }
    } catch (err) {
      console.log(`[timedtext] Fetch error for ${url}: ${err}`);
    }
  }

  return '';
}

async function fetchTranscriptFromPage(videoId: string): Promise<string> {
  console.log(`[page-scrape] Trying for ${videoId}`);

  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    console.log(`[page-scrape] Page fetch status for ${videoId}: ${response.status}`);

    if (!response.ok) return '';

    const html = await response.text();
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionTracksMatch) {
      console.log(`[page-scrape] No captionTracks in page for ${videoId}`);
      return '';
    }

    let captionTracks;
    try {
      captionTracks = JSON.parse(captionTracksMatch[1]);
    } catch {
      console.log(`[page-scrape] Failed to parse captionTracks for ${videoId}`);
      return '';
    }

    console.log(`[page-scrape] Found ${captionTracks.length} tracks in page for ${videoId}`);
    captionTracks.forEach((t: any, i: number) => {
      console.log(`[page-scrape] Track ${i}: lang=${t.languageCode}, vssId=${t.vssId}`);
    });

    const englishTrack = captionTracks.find(
      (t: any) => t.languageCode === 'en' || t.vssId?.includes('.en')
    ) || captionTracks[0];

    if (!englishTrack?.baseUrl) {
      console.log(`[page-scrape] No baseUrl on selected track for ${videoId}`);
      return '';
    }

    const captionResponse = await fetch(englishTrack.baseUrl + '&fmt=json3');
    console.log(`[page-scrape] Caption fetch status for ${videoId}: ${captionResponse.status}`);
    if (!captionResponse.ok) return '';

    const captionData = await captionResponse.json();
    if (!captionData.events) {
      console.log(`[page-scrape] No events in caption data for ${videoId}`);
      return '';
    }

    const transcript = captionData.events
      .filter((e: any) => e.segs)
      .map((e: any) => e.segs.map((s: any) => s.utf8 || '').join(''))
      .join(' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[page-scrape] Success for ${videoId}, length: ${transcript.length}`);
    return transcript;
  } catch (err) {
    console.error(`[page-scrape] Error for ${videoId}:`, err);
    return '';
  }
}

async function getTranscript(accessToken: string, videoId: string): Promise<string> {
  console.log(`[transcript] === Starting all methods for ${videoId} ===`);

  let transcript = await fetchCaptionsViaOfficialAPI(accessToken, videoId);
  if (transcript.length > 0) {
    console.log(`[transcript] Got transcript via official API for ${videoId}`);
    return transcript;
  }

  transcript = await fetchCaptionsViaTimedText(videoId);
  if (transcript.length > 0) {
    console.log(`[transcript] Got transcript via timedtext for ${videoId}`);
    return transcript;
  }

  transcript = await fetchTranscriptFromPage(videoId);
  if (transcript.length > 0) {
    console.log(`[transcript] Got transcript via page scrape for ${videoId}`);
    return transcript;
  }

  console.log(`[transcript] === All methods failed for ${videoId} ===`);
  return '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const { videoIds }: RequestBody = await req.json();
    console.log(`[main] Fetching transcripts for user ${userId}, videos: ${videoIds.join(', ')}`);

    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenData) {
      throw new Error('No YouTube token found');
    }

    let accessToken = tokenData.access_token;

    if (new Date(tokenData.token_expiry) < new Date()) {
      console.log('[main] Token expired, refreshing...');
      accessToken = await refreshAccessToken(tokenData.refresh_token);
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + 3600);
      await supabase
        .from('user_tokens')
        .update({ access_token: accessToken, token_expiry: newExpiry.toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('video_id, transcript')
      .eq('user_id', userId)
      .in('video_id', videoIds);

    if (videosError) throw videosError;

    const results: Record<string, boolean> = {};

    for (const video of (videos || [])) {
      if (video.transcript && video.transcript.length > 0) {
        console.log(`[main] Already have transcript for ${video.video_id}`);
        results[video.video_id] = true;
        continue;
      }

      console.log(`[main] Fetching transcript for ${video.video_id}`);
      const transcript = await getTranscript(accessToken, video.video_id);

      if (transcript.length > 0) {
        await supabase
          .from('videos')
          .update({ transcript })
          .eq('user_id', userId)
          .eq('video_id', video.video_id);
        console.log(`[main] Saved transcript for ${video.video_id}`);
        results[video.video_id] = true;
      } else {
        console.log(`[main] No transcript found for ${video.video_id}`);
        results[video.video_id] = false;
      }
    }

    const successCount = Object.values(results).filter(Boolean).length;
    console.log(`[main] Done. ${successCount}/${videoIds.length} transcripts fetched`);

    return new Response(
      JSON.stringify({ success: true, results, successCount, total: videoIds.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[main] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
