import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { parseModelJson } from '../_shared/json.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Only callable by admin (check secret header)
  const secret = req.headers.get('x-admin-secret');
  if (secret !== Deno.env.get('ADMIN_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  // Fetch all feedback with associated analysis
  const { data: feedbacks, error: fbError } = await supabase
    .from('analysis_feedback')
    .select(`
      id, rating, reason, created_at,
      analyses (
        hook_analysis,
        weak_spots,
        new_hook_ideas,
        analysis_type
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (fbError) throw fbError;
  if (!feedbacks || feedbacks.length === 0) {
    return new Response(JSON.stringify({ message: 'No feedback yet' }), { headers: corsHeaders });
  }

  const goodCount = feedbacks.filter(f => f.rating === 'good').length;
  const badCount = feedbacks.filter(f => f.rating === 'bad').length;

  const feedbackText = feedbacks.map(f => {
    const a = f.analyses as any;
    return `[${f.rating.toUpperCase()}]${f.reason ? ` Reason: "${f.reason}"` : ''}
Assessment: ${a?.hook_analysis?.overall_assessment?.slice(0, 300) || 'N/A'}
Score given: ${a?.hook_analysis?.overall_score ?? 'N/A'}
Weak spots: ${(a?.weak_spots || []).join(' | ')}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `You are a quality analyst for Chumoku, an AI tool that analyzes YouTube Shorts hooks.

Your job: review creator feedback on analyses and extract GENUINE patterns that should inform future analyses.

CRITICAL RULES for reading feedback:
1. Do NOT treat all negative feedback as truth. Creators often disagree with accurate feedback when it challenges their ego. A "bad" rating with no reason is weak signal.
2. DO trust negative feedback when: multiple users mention the same issue, the reason is specific and concrete, or it reveals a format/niche the model misunderstood.
3. DO trust positive feedback as signal that certain analysis styles land well.
4. Look for contradictions — if 5 people liked something and 2 hated it, note the nuance, don't just average it out.
5. Ignore feedback that is vague ("it was wrong", "i dont agree") unless paired with a specific reason.
6. Never create rules from single data points.

OUTPUT: Return a JSON array of knowledge base entries to UPSERT. Each entry:
{
  "category": "scoring | hook_types | formats | tone | weak_spots | general",
  "title": "short descriptive title (max 8 words)",
  "content": "the actual insight, specific and actionable (2-4 sentences max)"
}

Only return entries backed by clear patterns in the data. If the data is too sparse or contradictory, return fewer entries. Quality over quantity.`;

  const userPrompt = `Total feedback: ${feedbacks.length} (${goodCount} good, ${badCount} bad)

FEEDBACK DATA:
${feedbackText}

Extract patterns and return knowledge base entries as JSON array.`;

  const content = await callLLM(userPrompt, { system: systemPrompt, maxTokens: 2000 });

  let entries: any[] = [];
  try {
    if (/\[[\s\S]*\]/.test(content)) entries = parseModelJson(content, 'knowledge base', 'array');
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse Claude response', raw: content }), { headers: corsHeaders });
  }

  if (entries.length === 0) {
    return new Response(JSON.stringify({ message: 'No patterns extracted yet', feedback_count: feedbacks.length }), { headers: corsHeaders });
  }

  // Upsert entries into knowledge_base
  const rows = entries.map((e: any) => ({
    category: e.category,
    title: e.title,
    content: e.content,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from('knowledge_base')
    .upsert(rows, { onConflict: 'title' });

  if (upsertError) throw upsertError;

  return new Response(
    JSON.stringify({ success: true, entries_written: entries.length, feedback_processed: feedbacks.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
