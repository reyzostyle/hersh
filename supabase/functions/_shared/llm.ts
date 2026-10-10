// Provider-agnostic single-turn text completion, shared by every function
// that scores or writes text with an LLM. Swapping which model backs them is
// a `supabase secrets set` away — no code change, no redeploy.
//
// ANALYSIS_PROVIDER selects the provider (default 'anthropic'):
//   anthropic     -> ANTHROPIC_API_KEY (already configured)
//   google        -> GEMINI_API_KEY (already configured; also used elsewhere
//                    for video understanding)
//   openai_compat -> any OpenAI-compatible chat endpoint: Qwen via DashScope,
//                    OpenRouter, DeepSeek, Groq, Together, etc. Needs
//                    ANALYSIS_BASE_URL (the provider's /v1 root) and
//                    ANALYSIS_API_KEY. This is the path new providers use —
//                    most non-Anthropic, non-Google providers speak this
//                    dialect, so adding one is a key + base URL, not new code.
//
// ANALYSIS_MODEL selects the model (default 'claude-sonnet-5').

// Images sent alongside the prompt, already base64 encoded without the data:
// URL prefix. All three providers below accept them, in three different shapes,
// which is the whole reason this lives here rather than at a call site.
//
// A list rather than one, because a question rarely comes with exactly one
// screenshot: the retention curve and the traffic sources are two screens, and
// answering from one of them is answering half the question.
//
// The model has to be a multimodal one. ANALYSIS_MODEL is a secret, so nothing
// here can check that: a text-only model sent an image returns the provider's
// own 400, which callLLM surfaces verbatim. That is the intended failure - a
// clear error naming the model beats silently dropping the images and
// answering a question about screenshots nobody looked at.
export interface LLMImage {
  mimeType: string;
  base64: string;
}

export interface LLMCallOptions {
  system?: string;
  maxTokens: number;
  images?: LLMImage[];
  // 'writer' is for text a creator reads and films: chat replies, outlines,
  // scripts. It can run on a stronger model than the bulk work (pitching
  // titles, search phrases) via WRITER_PROVIDER / WRITER_MODEL, and falls back
  // to ANALYSIS_* when those are not set.
  tier?: 'bulk' | 'writer';
}

function resolveModel(tier: LLMCallOptions['tier']): { provider: string; model: string } {
  const provider = Deno.env.get('ANALYSIS_PROVIDER') || 'anthropic';
  const model = Deno.env.get('ANALYSIS_MODEL') || 'claude-sonnet-5';
  if (tier !== 'writer') return { provider, model };
  return {
    provider: Deno.env.get('WRITER_PROVIDER') || provider,
    model: Deno.env.get('WRITER_MODEL') || model,
  };
}

// Thinking and output budget per Gemini model. Thinking tokens come out of
// maxOutputTokens, so a model that thinks by default silently truncates a
// JSON answer sized for one that does not.
// - Flash-Lite (2.5, 3.5): does not think; 3.5 Flash-Lite 400s on an explicit
//   thinkingBudget, so it gets no thinking config at all.
// - Flash 3.6 and later: thinkingLevel "low". Measured 2026-10-10 on 3.8 Flash:
//   no thought tokens reported, and the writing is noticeably less stiff than
//   Flash-Lite's. It rejects "minimal". Headroom added in case low still thinks.
// - Older plain Flash (2.5, 3.5): thinkingBudget 0, as before.
// - Pro cannot go below a minimum budget, so it gets a wider ceiling instead.
export function geminiGenerationConfig(model: string, maxTokens: number): Record<string, unknown> {
  if (/flash-lite/i.test(model)) return { maxOutputTokens: maxTokens };
  const newFlash = /gemini-(3\.[6-9]|[4-9])[\d.]*-flash/i.test(model);
  if (newFlash) return { maxOutputTokens: maxTokens + 2048, thinkingConfig: { thinkingLevel: 'low' } };
  if (/flash/i.test(model)) return { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } };
  return { maxOutputTokens: maxTokens * 4 };
}

// The visible answer: every text part that is not a thought, joined. Gemini 3
// can split an answer across parts, and taking parts[0] dropped the rest.
// deno-lint-ignore no-explicit-any
function geminiText(data: any): string {
  // deno-lint-ignore no-explicit-any
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
}

// 529 is Anthropic's overloaded signal; 429/500/502/503 are the general
// transient set other providers use for the same condition.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const RETRIES = 3;

export async function callLLM(prompt: string, opts: LLMCallOptions): Promise<string> {
  const { provider, model } = resolveModel(opts.tier);

  let response: Response | null = null;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
    response = await callOnce(provider, model, prompt, opts);
    if (response.ok || !RETRYABLE_STATUS.has(response.status)) break;
  }
  if (!response) throw new Error(`${provider}/${model}: no response`);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider}/${model} error (${response.status}): ${errText}`);
  }
  return extractText(provider, await response.json());
}

async function callOnce(provider: string, model: string, prompt: string, opts: LLMCallOptions): Promise<Response> {
  switch (provider) {
    case 'anthropic': {
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens,
          ...(opts.system ? { system: opts.system } : {}),
          // Images first, question second. Anthropic reads a prompt about an
          // image better in that order, and the other two are indifferent.
          messages: [{
            role: 'user',
            content: opts.images?.length
              ? [
                  ...opts.images.map(im => ({
                    type: 'image',
                    source: { type: 'base64', media_type: im.mimeType, data: im.base64 },
                  })),
                  { type: 'text', text: prompt },
                ]
              : prompt,
          }],
        }),
      });
    }

    case 'google': {
      const apiKey = Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
      return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          contents: [{
            role: 'user',
            parts: opts.images?.length
              ? [
                  ...opts.images.map(im => ({ inline_data: { mime_type: im.mimeType, data: im.base64 } })),
                  { text: prompt },
                ]
              : [{ text: prompt }],
          }],
          generationConfig: geminiGenerationConfig(model, opts.maxTokens),
        }),
      });
    }

    case 'openai_compat': {
      const apiKey = Deno.env.get('ANALYSIS_API_KEY');
      const baseUrl = Deno.env.get('ANALYSIS_BASE_URL');
      if (!apiKey) throw new Error('ANALYSIS_API_KEY not configured');
      if (!baseUrl) throw new Error('ANALYSIS_BASE_URL not configured');
      const userContent = opts.images?.length
        ? [
            ...opts.images.map(im => ({
              type: 'image_url',
              image_url: { url: `data:${im.mimeType};base64,${im.base64}` },
            })),
            { type: 'text', text: prompt },
          ]
        : prompt;
      const messages = opts.system
        ? [{ role: 'system', content: opts.system }, { role: 'user', content: userContent }]
        : [{ role: 'user', content: userContent }];
      return fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: opts.maxTokens, messages }),
      });
    }

    default:
      throw new Error(`Unknown ANALYSIS_PROVIDER: ${provider}`);
  }
}

function extractText(provider: string, data: any): string {
  switch (provider) {
    case 'anthropic':
      return data.content?.[0]?.text || '';
    case 'google':
      return geminiText(data);
    case 'openai_compat':
      return data.choices?.[0]?.message?.content || '';
    default:
      return '';
  }
}

// ─── Tools ───────────────────────────────────────────────────────────────────

// The same model, allowed to go and look something up before it answers.
//
// The alternative was pasting the creator's ideas, notes, projects and numbers
// into every prompt. That makes the answer rigid - a fixed block of context
// shapes every reply whether it is relevant or not - and it pays for the whole
// dossier on "how long should a hook be". Here the model decides: a question
// about their own stuff costs a second round trip, a general question costs
// exactly what it costs today. Verified against the live model before this was
// built: it calls the tool for "which of my saved ideas are about minecraft?"
// and answers "how long should a hook be" without touching one.
//
// Google only, on purpose. Tool calling is three different protocols across the
// three providers, and writing the other two blind - against models nobody here
// has tested this path on - is how you ship a silent downgrade. The others
// throw, loudly, naming the fix.

export interface ToolSpec {
  name: string;
  description: string;
  /** Google's schema dialect: types are uppercase (STRING, OBJECT, ARRAY). */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface LLMToolOptions extends LLMCallOptions {
  tools: ToolSpec[];
  /** Runs the tool and returns whatever should go back to the model. */
  run: (call: ToolCall) => Promise<unknown>;
  /** Ceiling on round trips, so a confused model cannot bill someone forever. */
  maxRounds?: number;
  /** Called once per tool the model actually used, for logging and pricing. */
  onToolUsed?: (call: ToolCall) => void;
}

const DEFAULT_MAX_ROUNDS = 3;

export async function callLLMWithTools(prompt: string, opts: LLMToolOptions): Promise<string> {
  const { provider, model } = resolveModel(opts.tier);

  if (provider !== 'google') {
    throw new Error(
      `Tool calling is implemented for the google provider only, and ANALYSIS_PROVIDER is "${provider}". ` +
      `Either set ANALYSIS_PROVIDER=google or use callLLM, which works on all three.`,
    );
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  // deno-lint-ignore no-explicit-any
  const contents: any[] = [{
    role: 'user',
    parts: opts.images?.length
      ? [
          ...opts.images.map(im => ({ inline_data: { mime_type: im.mimeType, data: im.base64 } })),
          { text: prompt },
        ]
      : [{ text: prompt }],
  }];

  const body = () => JSON.stringify({
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    tools: [{ functionDeclarations: opts.tools }],
    contents,
    generationConfig: geminiGenerationConfig(model, opts.maxTokens),
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;

  for (let round = 0; round < maxRounds; round++) {
    let response: Response | null = null;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body(),
      });
      if (response.ok || !RETRYABLE_STATUS.has(response.status)) break;
    }
    if (!response) throw new Error(`${provider}/${model}: no response`);
    if (!response.ok) {
      throw new Error(`${provider}/${model} error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content;
    // deno-lint-ignore no-explicit-any
    const parts: any[] = content?.parts ?? [];
    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall as ToolCall);

    if (!calls.length) {
      return parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
    }

    // The model's turn goes back VERBATIM. Gemini 3.x rejects a rebuilt
    // functionCall part - "missing a thought_signature" - because the signature
    // rides on the part and has to return with it. Reconstructing the call from
    // its name and args, which is the obvious thing to write, fails with a 400
    // on the very next request.
    contents.push(content);

    const responses = [];
    for (const call of calls) {
      opts.onToolUsed?.(call);
      let result: unknown;
      try {
        result = await opts.run({ name: call.name, args: call.args ?? {} });
      } catch (e) {
        // A failed lookup is an answer too. Telling the model the tool broke
        // lets it say so or work around it; throwing here loses the whole reply
        // over one query.
        result = { error: e instanceof Error ? e.message : 'lookup failed' };
      }
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }

  // Out of rounds with no prose. Better an honest empty string, which the
  // caller already handles, than a half-finished tool transcript.
  return '';
}

// ─── Web search ──────────────────────────────────────────────────────────────

// What is true right now, from Google, for the chat to answer with.
//
// Every model's memory stops somewhere. Asked the newest Claude Sonnet on
// 2026-10-10, 3.8 Flash said "3.7 Sonnet" and Flash-Lite said "3.5" - and the
// chat had been recommending exactly that to a creator whose channel is about
// these tools. The same model with Google Search grounding said "Sonnet 5.5".
//
// A separate call rather than google_search beside the chat's own tools:
// combining built-in and custom tools is preview-only and on another API. Here
// it is a plain function tool that happens to run a grounded request.
export async function searchWeb(query: string): Promise<{ answer: string; sources: { title: string; url: string }[] }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const model = Deno.env.get('SEARCH_MODEL') || 'gemini-3.8-flash';
  const today = new Date().toISOString().slice(0, 10);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Today is ${today}. Search the web and answer in a few factual sentences, with dates and version numbers where they matter. Prefer the newest information.\n\n${query}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: geminiGenerationConfig(model, 800),
    }),
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const chunks: any[] = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return {
    answer: geminiText(data),
    sources: chunks
      .map(c => ({ title: String(c.web?.title ?? ''), url: String(c.web?.uri ?? '') }))
      .filter(c => c.url)
      .slice(0, 5),
  };
}
