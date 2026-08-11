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

export interface LLMCallOptions {
  system?: string;
  maxTokens: number;
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
          messages: [{ role: 'user', content: prompt }],
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
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
      const messages = opts.system
        ? [{ role: 'system', content: opts.system }, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];
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
