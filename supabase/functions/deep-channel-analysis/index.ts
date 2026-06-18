import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

function stripDashes(value: any): any {
  if (typeof value === 'string') return value.replace(/[—–]/g, '-');
  if (Array.isArray(value)) return value.map(stripDashes);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value)) out[k] = stripDashes(value[k]);
    return out;
  }
  return value;
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'];

async function analyzeVideoWithGemini(videoId: string, geminiKey: string): Promise<any> {
  const prompt = `You're watching a YouTube Short. Extract these fields as JSON only (no markdown):
{
  "hook": "exact spoken/text hook in first 3 seconds",
  "message": "core message or point of the video in 1 sentence",
  "style": "content style (e.g. talking head, skit, listicle, story, tutorial, reaction, vlog)",
  "visual": "visual style in 5-10 words (e.g. handheld vlog, polished studio, screen recording, b-roll heavy)",
  "energy": "low/medium/high",
  "summary": "1-2 sentence summary of what happens in the video"
}`;

  let lastError = '';
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { file_data: { mime_type: 'video/mp4', file_uri: `https://www.youtube.com/watch?v=${videoId}` } },
                { text: prompt },
              ],
            }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 600,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} ${await res.text()}`;
        continue;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = `${model}: empty response`;
        continue;
      }
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  console.error(`[deep] gemini failed for ${videoId}: ${lastError}`);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    // Verify the JWT signature via the auth server — never trust a decoded-only token.
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user: authedUser }, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !authedUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = authedUser.id;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let days = 30;
    try {
      const body = await req.json();
      if (body.days && typeof body.days === 'number') days = Math.min(Math.max(body.days, 7), 90);
    } catch { /* no body */ }

    // 1. Get tokens + plan + deep analysis counter
    const { data: tokenRow, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token, refresh_token, token_expiry, plan, deep_analyses_used, deep_analyses_reset_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenRow?.access_token) {
      console.error('[deep] token lookup failed:', tokenError?.message, 'hasToken:', !!tokenRow?.access_token);
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Plan check — Pro only
    const plan = tokenRow.plan || 'free';
    if (plan !== 'pro' && plan !== 'agency') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'pro' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Monthly counter — 5 deep analyses per Pro user
    const DEEP_LIMIT = 5;
    const now = Date.now();
    const resetAt = tokenRow.deep_analyses_reset_at ? new Date(tokenRow.deep_analyses_reset_at).getTime() : 0;
    const needsReset = (now - resetAt) > 30 * 24 * 60 * 60 * 1000;
    let deepUsed = needsReset ? 0 : (tokenRow.deep_analyses_used ?? 0);

    if (deepUsed >= DEEP_LIMIT) {
      return new Response(JSON.stringify({ error: 'limit_reached', used: deepUsed, limit: DEEP_LIMIT }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1b. Get optional channel profile columns (may not exist — swallow errors)
    let channelNiche = '';
    let channelDescription = '';
    let channelContext = '';
    let creatorLevel = 'intermediate';
    try {
      const { data: profileRow } = await supabase
        .from('user_tokens')
        .select('channel_niche, channel_description, channel_context, creator_level')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileRow) {
        channelNiche = profileRow.channel_niche || '';
        channelDescription = profileRow.channel_description || '';
        channelContext = profileRow.channel_context || '';
        creatorLevel = profileRow.creator_level || 'intermediate';
      }
    } catch { /* columns may not exist yet — fine */ }

    let accessToken = tokenRow.access_token;
    const now = Date.now();
    const expiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : 0;
    if (expiry < now + 60_000) {
      const clientId = Deno.env.get('YOUTUBE_CLIENT_ID')!;
      const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET')!;
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        const newExpiry = new Date(now + (refreshData.expires_in || 3600) * 1000).toISOString();
        await supabase
          .from('user_tokens')
          .update({ access_token: accessToken, token_expiry: newExpiry })
          .eq('user_id', userId);
      }
    }

    // 2. Channel info
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const channelData = await channelRes.json();
    const channelItem = channelData.items?.[0];
    if (!channelItem) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uploadsPlaylistId = channelItem.contentDetails?.relatedPlaylists?.uploads;
    const channelName = channelItem.snippet?.title || '';
    const subscribers = parseInt(channelItem.statistics?.subscriberCount || '0');

    // 3. Get uploads (last `days` days, max 25)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let videoIds: string[] = [];
    if (uploadsPlaylistId) {
      const playlistRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const playlistData = await playlistRes.json();
      videoIds = (playlistData.items || [])
        .filter((it: any) => {
          const publishedAt = it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt;
          if (!publishedAt) return false;
          const pubDate = new Date(publishedAt);
          return pubDate >= startDate;
        })
        .map((it: any) => it.contentDetails?.videoId || it.snippet?.resourceId?.videoId)
        .filter(Boolean)
        .slice(0, 25);
    }

    if (videoIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No videos found in selected period.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Details + filter to Shorts
    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const detailsData = await detailsRes.json();
    const shorts = (detailsData.items || [])
      .filter((v: any) => {
        const dur = parseDuration(v.contentDetails?.duration || '');
        return dur > 0 && dur <= 60;
      })
      .map((v: any) => ({
        id: v.id,
        title: v.snippet?.title || '',
        publishedAt: v.snippet?.publishedAt || '',
        duration: parseDuration(v.contentDetails?.duration || ''),
        views: parseInt(v.statistics?.viewCount || '0'),
        likes: parseInt(v.statistics?.likeCount || '0'),
      }))
      .sort((a: any, b: any) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());

    if (shorts.length === 0) {
      return new Response(JSON.stringify({ error: 'No Shorts found in selected period.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Pick the newest 3 Shorts (shorts is sorted oldest -> newest)
    const toAnalyze: any[] = shorts.slice(-3);

    // 6. Analyze each with Gemini (parallel)
    const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
    const analyses = await Promise.all(
      toAnalyze.map(async (v) => {
        const result = await analyzeVideoWithGemini(v.id, geminiKey);
        return { ...v, analysis: result };
      })
    );

    const analyzedVideos = analyses.filter((a) => a.analysis !== null);
    if (analyzedVideos.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not analyze any videos. Gemini may be unavailable or videos may be unlisted/private.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Build Claude prompt
    const videoBlock = analyzedVideos.map((v, i) => `Video ${i + 1} (${v.publishedAt.slice(0, 10)}):
  Title: "${v.title}"
  Views: ${v.views} | Likes: ${v.likes}
  Hook: ${v.analysis.hook}
  Core message: ${v.analysis.message}
  Style: ${v.analysis.style}
  Visual: ${v.analysis.visual}
  Energy: ${v.analysis.energy}
  Summary: ${v.analysis.summary}`).join('\n\n');

    const intendedNiche = channelNiche || '(not set)';
    const intendedDesc = channelDescription || channelContext || '(not set)';

    const systemPrompt = `You are a senior YouTube content strategist analyzing a creator's CHANNEL AS A WHOLE, not individual videos. You have actually watched their recent Shorts (via summaries from a video model) and have the channel's performance numbers. Your job is to give a verdict on the channel's overall direction - what it actually is in practice, what's working creatively, who the algorithm is sending vs who they want, and where to take it next. Peer-to-peer tone, direct, no fluff, no em dashes.`;

    const userPrompt = `Channel: ${channelName} (${subscribers.toLocaleString()} subs, creator level: ${creatorLevel})
Intended niche: ${intendedNiche}
Intended description: ${intendedDesc}

Recent videos (chronological order):

${videoBlock}

Total Shorts analyzed: ${analyzedVideos.length} of ${shorts.length} posted in last ${days} days.

Look at this as a portfolio. What patterns repeat? What's the actual identity vs the stated one? Which direction is rewarded by views/likes? Who is the algorithm sending to based on this content?

Return ONLY this JSON (no markdown, no commentary):
{
  "channelIdentity": "2-3 sentences: what is this channel actually about based on the content you saw, not what the creator said it was",
  "workingDirection": "2-3 sentences: what creative direction or content style is clearly working (back up with specific videos/numbers)",
  "audienceMatch": "2-3 sentences: who is the algorithm sending? Does it match the intended audience/niche above? If misaligned, say so.",
  "contentThemes": ["3-5 short theme/pattern strings observed across the videos"],
  "directionRecommendation": "3-4 sentences: where to take the channel next, what to double down on, what to cut. Be specific.",
  "biggestRisk": "1-2 sentences: biggest mistake or risk if they continue current direction"
}`;

    // 8. Call Claude with retry
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    const claudeBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: claudeBody,
      });
      if (response.ok || response.status !== 529) break;
    }

    if (!response || !response.ok) {
      throw new Error(`Claude API error: ${response ? await response.text() : 'No response'}`);
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text || '{}';
    const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      // Try to extract JSON between first { and last }
      const start = cleanedJson.indexOf('{');
      const end = cleanedJson.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(cleanedJson.slice(start, end + 1));
      } else {
        throw new Error('Failed to parse Claude response as JSON');
      }
    }

    parsed = stripDashes(parsed);

    const analyzedAt = new Date().toISOString();

    // 9. Increment deep analysis counter
    await supabase.from('user_tokens').update({
      deep_analyses_used: deepUsed + 1,
      ...(needsReset ? { deep_analyses_reset_at: new Date().toISOString() } : {}),
    }).eq('user_id', userId);

    // 10. Save to DB
    try {
      await supabase.from('channel_deep_analyses').insert({
        user_id: userId,
        channel_identity: parsed.channelIdentity,
        working_direction: parsed.workingDirection,
        audience_match: parsed.audienceMatch,
        content_themes: parsed.contentThemes,
        direction_recommendation: parsed.directionRecommendation,
        biggest_risk: parsed.biggestRisk,
        video_count: analyzedVideos.length,
      });
    } catch (dbErr) {
      console.error('[deep] DB save failed (table may not exist yet):', dbErr instanceof Error ? dbErr.message : String(dbErr));
    }

    return new Response(JSON.stringify({
      analyzedAt,
      videoCount: analyzedVideos.length,
      channelIdentity: parsed.channelIdentity,
      workingDirection: parsed.workingDirection,
      audienceMatch: parsed.audienceMatch,
      contentThemes: parsed.contentThemes,
      directionRecommendation: parsed.directionRecommendation,
      biggestRisk: parsed.biggestRisk,
      deepUsed: deepUsed + 1,
      deepLimit: DEEP_LIMIT,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    console.error('[deep-channel-analysis] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
