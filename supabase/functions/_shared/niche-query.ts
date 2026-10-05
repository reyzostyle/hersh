import { callLLM } from './llm.ts';

// One YouTube search phrase for a creator's subject. Shared by auto-find
// (find-competitor-channels) and the daily drop (daily-ideas), which both go
// looking for other people winning on the same topic.

// deno-lint-ignore no-explicit-any
export async function buildQuery(scan: any, niche: string, description: string): Promise<string> {
  const titles = (scan?.videos ?? []).slice(0, 20).map((v: any) => `- ${v.title}`).join('\n');

  // Raw titles make terrible queries: they are full of hashtags, emoji and
  // in-jokes. One cheap call turns them into the phrase a viewer would type.
  const prompt = `A creator wants to find other YouTube channels making short-form videos on their subject.

What they say their channel is about:
Niche: ${niche || 'not set'}
Description: ${description || 'not set'}

The titles of their own recent uploads:
${titles || 'none available'}

Write ONE YouTube search phrase in ENGLISH that would surface popular Shorts on the same subject, made by other people. Two to five words, the words an English-speaking viewer would actually type, no hashtags, no emoji, no channel names, no quotes. Reply with the phrase and nothing else.`;

  const raw = await callLLM(prompt, { maxTokens: 40 });
  return raw.replace(/["'\n#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
