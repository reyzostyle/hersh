import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { analyzeVideo } from '../_shared/analyze-video.ts';
import { parseImages } from '../_shared/images.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

function deleteGeminiFile(geminiFileName: string) {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiApiKey && geminiFileName) {
    fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiApiKey}`, { method: 'DELETE' })
      .catch(e => console.log('[analyze-upload] Gemini cleanup error:', e));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT signature via the auth server, then read id/email from the
    // VERIFIED user. Never trust raw token claims — the signature isn't checked
    // by the gateway, so a decoded-only token could be forged (e.g. admin email).
    let userId: string;
    let userEmail: string;
    try {
      const { data: { user: u }, error } = await supabase.auth.getUser(token);
      if (error || !u) throw new Error('invalid token');
      userId = u.id;
      userEmail = u.email || '';
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { geminiFileName, videoContext, fileName, mimeType, images: rawImages } = await req.json();
    const { images, error: imageError } = parseImages(rawImages);
    if (imageError) {
      return new Response(
        JSON.stringify({ error: imageError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!geminiFileName) {
      return new Response(JSON.stringify({ error: 'geminiFileName required' }), { status: 400, headers: corsHeaders });
    }

    console.log(`[analyze-upload] user=${userId}, geminiFileName=${geminiFileName}`);

    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, channel_niche, channel_description, channel_context, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    const isAdmin = userEmail === ADMIN_EMAIL;

    // Every plan, including free, spends from the shared credit pool — free's
    // allowance is just a one-time grant that never resets (_shared/credits.ts).
    const creditStatus = await loadCreditStatus(supabase, userId);
    if (!canAfford(creditStatus, CREDIT_COSTS.video_analysis, isAdmin)) {
      deleteGeminiFile(geminiFileName);
      const message = plan === 'agency'
        ? "You've hit this month's fair-use credit limit. Contact us if you need more."
        : plan === 'free'
          ? 'Your free credits are used up. Upgrade to keep analyzing.'
          : "You've used all your credits this month. Upgrade for more.";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiApiKey) throw new Error('Gemini API key not configured');

      // Poll until Gemini file is ACTIVE
      console.log('[analyze-upload] Polling for ACTIVE state...');
      let geminiFileUri = '';
      let fileMimeType = mimeType || 'video/mp4';

      for (let i = 0; i < 30; i++) {
        const stateRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiApiKey}`
        );
        if (!stateRes.ok) throw new Error(`Poll failed: ${await stateRes.text()}`);
        const stateData = await stateRes.json();
        console.log(`[analyze-upload] Poll ${i + 1}: state=${stateData.state}`);

        if (stateData.state === 'ACTIVE') {
          geminiFileUri = stateData.uri;
          fileMimeType = stateData.mimeType || fileMimeType;
          break;
        }
        if (stateData.state === 'FAILED') throw new Error('Gemini file processing failed');
        await new Promise(r => setTimeout(r, 3000));
      }

      if (!geminiFileUri) throw new Error('Gemini file processing timed out');
      console.log('[analyze-upload] File ACTIVE, analyzing...');

      const profile = {
        channel_niche: tokenRow?.channel_niche || '',
        channel_description: tokenRow?.channel_description || '',
        channel_context: tokenRow?.channel_context || '',
        creator_level: tokenRow?.creator_level || 'intermediate',
      };

      const videoTitle = (fileName || 'video').replace(/\.[^.]+$/, '');
      // An upload is the creator's own footage, usually unpublished: no public
      // stats and no retention curve, but the channel profile does apply.
      const video = {
        title: videoTitle,
        duration: null,
        views: null,
        likes_count: null,
        retention_percentage: null,
        average_view_duration: null,
        retention_drops: '',
        is_external: false,
      };

      const analysis = await analyzeVideo(
        { fileUri: geminiFileUri, mimeType: fileMimeType },
        video, profile, videoContext, supabase, profile.creator_level, images,
      );
      console.log('[analyze-upload] Analysis done');

      const { data: analysisData, error: analysisError } = await supabase
        .from('analyses')
        .insert({
          user_id: userId,
          video_ids: [],
          hook_analysis: { overall_assessment: analysis.overall_assessment, overall_score: analysis.overall_score, score_breakdown: analysis.score_breakdown || null, title: videoTitle || null, source: 'upload' },
          strong_spots: analysis.strong_spots || [],
          weak_spots: analysis.weak_spots,
          new_hook_ideas: [],
          analysis_type: 'advanced',
        })
        .select()
        .single();

      if (analysisError) throw analysisError;

      await spendCredits(supabase, userId, creditStatus, CREDIT_COSTS.video_analysis);

      return new Response(
        JSON.stringify({ success: true, analysis: analysisData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      deleteGeminiFile(geminiFileName);
    }
  } catch (error) {
    console.error('[analyze-upload] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
