import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { watchVideo } from '../_shared/analyze-video.ts';
import { loadChannelScan, channelScanBlock } from '../_shared/channel-scan.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

// Verifies the JWT signature via the auth server (not just decoding it) and
// returns the authenticated user id. Throws on any invalid/forged token.
async function getUserIdFromToken(supabase: any, token: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('invalid token');
  return user.id;
}

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

// The outline is written while WATCHING the competitor's video, not from a
// transcript of it. That is the whole point of the step: half of what makes a
// Short work is on screen and nowhere in the words - where the cut lands, what
// the overlay says, how the first frame is framed, how long the pause before
// the payoff is. Read blind, the model can only paraphrase the topic; watching,
// it can say "they hold on the reaction for a beat before cutting, do that".
async function generateOutline(
  videoId: string,
  videoTitle: string,
  adaptedIdea: string,
  profileBlock: string,
  scanBlock: string,
): Promise<{ hook: string; sections: Array<{ title: string; content: string; duration: string }>; cta: string }> {
  const prompt = `You are watching a competitor's YouTube Short that outperformed its channel. Write the outline for the version THIS creator should make.

The angle already worked out for them: ${adaptedIdea}
The video you are watching: "${videoTitle}"

${profileBlock}${scanBlock}

Watch it properly first. Note how the first frame is composed, what is on screen in the opening second, where the cuts land, what any text overlay says, and how long it sits before the payoff. Those are the parts that do not survive into a transcript, and they are what you are here to carry over.

Then write the outline for the creator's own version: same structural moves, their subject matter, their register. Say what to SHOW, not only what to say.

Follow this exact JSON format:

{
  "hook": "exact hook text spoken in first 3 seconds - make it punchy and attention-grabbing",
  "sections": [
    { "title": "Section name", "content": "what to say or show in this section", "duration": "10s" },
    { "title": "Section name", "content": "what to say or show in this section", "duration": "15s" },
    { "title": "Section name", "content": "what to say or show in this section", "duration": "20s" }
  ],
  "cta": "closing line that drives engagement or follow"
}

Rules:
- 3 to 4 sections total
- Hook must be the first thing said, not an intro
- Sections should build logically toward a payoff
- CTA should feel natural, not forced
- Every section names something visual, not just a line to say
- No em-dash or en-dash, only regular hyphen (-)
- Respond with JSON only, no markdown`;

  const content = await watchVideo(
    { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/mp4' },
    prompt,
    // Roomy: a truncated outline is a total loss, and the request is already
    // paid for by the time the model starts writing.
    { maxTokens: 8192 },
  );

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return stripDashes(JSON.parse(jsonMatch[0])) as { hook: string; sections: Array<{ title: string; content: string; duration: string }>; cta: string };
    }
    throw new Error('No JSON in response');
  } catch (e) {
    console.error('[generate-outline] unparseable model output:', content.slice(0, 800));
    throw new Error(`Could not read an outline back from the video: ${e instanceof Error ? e.message : 'no JSON found'}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');

    let userId: string;
    try {
      userId = await getUserIdFromToken(supabase, token);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders });
    }

    const { data: { user: authUser }, error: adminError } = await supabase.auth.admin.getUserById(userId);
    if (adminError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const isAdmin = authUser.email === ADMIN_EMAIL;

    // No plan gate. Competitors used to be Plus-only in five separate places,
    // which meant nobody could see the feature before paying for it - and the
    // gate was redundant anyway: the credit pool already is the trial. A free
    // account has 20 credits, one-time, and this costs four of them.
    const { data: profile } = await supabase
      .from('user_tokens')
      .select('channel_niche, channel_description, channel_context, target_audience')
      .eq('user_id', userId).maybeSingle();
    const creditStatus = await loadCreditStatus(supabase, userId);
    const cost = CREDIT_COSTS.competitor_outline;
    if (!canAfford(creditStatus, cost, isAdmin)) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ideaId } = await req.json();
    if (!ideaId) {
      return new Response(
        JSON.stringify({ error: 'ideaId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: idea, error: ideaError } = await supabase
      .from('competitor_ideas')
      .select('*')
      .eq('id', ideaId)
      .eq('user_id', userId)
      .single();

    if (ideaError || !idea) {
      return new Response(
        JSON.stringify({ error: 'Idea not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[generate-outline] Watching video for idea:', ideaId);
    const profileBlock = `## What they told us about their channel
Niche: ${profile?.channel_niche || 'not set'}
Description: ${profile?.channel_description || 'not set'}
Audience: ${profile?.target_audience || 'not set'}
Extra context: ${profile?.channel_context || 'not set'}`;
    const scanBlock = channelScanBlock(await loadChannelScan(supabase, userId));

    const outline = await generateOutline(
      idea.video_id,
      idea.video_title || '',
      idea.adapted_idea || '',
      profileBlock,
      scanBlock,
    );

    const { data: updated, error: updateError } = await supabase
      .from('competitor_ideas')
      .update({ outline })
      .eq('id', ideaId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    await spendCredits(supabase, userId, creditStatus, cost);

    return new Response(
      JSON.stringify({ success: true, idea: updated }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-outline] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
