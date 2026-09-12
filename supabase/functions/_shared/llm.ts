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
}

// 529 is Anthropic's overloaded signal; 429/500/502/503 are the general
// transient set other providers use for the same condition.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const RETRIES = 3;

export async function callLLM(prompt: string, opts: LLMCallOptions): Promise<string> {
  const provider = Deno.env.get('ANALYSIS_PROVIDER') || 'anthropic';
  const model = Deno.env.get('ANALYSIS_MODEL') || 'claude-sonnet-5';

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
      // Plain Flash (2.5 and 3.5) thinks by default, and thinking tokens draw
      // from the same maxOutputTokens budget as the visible answer — a budget
      // sized for Claude's answer-only output silently truncates the JSON
      // mid-object before Gemini gets to finish it. Flash-Lite (both
      // generations) doesn't think by default, so it needs no override — and
      // 3.5 Flash-Lite actively 400s if sent thinkingBudget: 0 (2.5 Flash-Lite
      // tolerates it, but it's a no-op either way). Pro can't go below a
      // minimum thinking budget, so it gets a wider output budget instead.
      const isFlashLite = /flash-lite/i.test(model);
      const isPlainFlash = /flash/i.test(model) && !isFlashLite;
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
          generationConfig: {
            maxOutputTokens: isFlashLite || isPlainFlash ? opts.maxTokens : opts.maxTokens * 4,
            ...(isPlainFlash ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
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
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
  const provider = Deno.env.get('ANALYSIS_PROVIDER') || 'anthropic';
  const model = Deno.env.get('ANALYSIS_MODEL') || 'claude-sonnet-5';

  if (provider !== 'google') {
    throw new Error(
      `Tool calling is implemented for the google provider only, and ANALYSIS_PROVIDER is "${provider}". ` +
      `Either set ANALYSIS_PROVIDER=google or use callLLM, which works on all three.`,
    );
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const isFlashLite = /flash-lite/i.test(model);
  const isPlainFlash = /flash/i.test(model) && !isFlashLite;

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
    generationConfig: {
      maxOutputTokens: isFlashLite || isPlainFlash ? opts.maxTokens : opts.maxTokens * 4,
      ...(isPlainFlash ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
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
      return parts.find(p => p.text)?.text || '';
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
