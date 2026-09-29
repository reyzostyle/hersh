// Invariants of the chat prompt in _shared/chat-prompt.ts.
//
// Run: npm run test:routing (needs deno, which the edge functions use anyway).
// No session, no model call, no credits.
//
// Until 2026-09-29 this guarded the router that sent hooks and scripts to an
// out-of-100 scorer. The scorer is gone from the chat; what is guarded now is
// that it stays gone and that the prompt keeps asking for short replies.

import { SYSTEM } from '../supabase/functions/_shared/chat-prompt.ts';

let failed = 0;
const fail = (msg: string) => { console.error(msg); failed++; };

// A tool name or a score in the prompt would put the grader back.
for (const banned of ['score_hook', 'score_script', 'out of 100', 'INTENT:']) {
  if (SYSTEM.includes(banned)) fail(`SYSTEM mentions "${banned}" - scoring was removed from the chat`);
}
// The things the new chat is for.
for (const required of ['Short.', 'ENDING ON A HOOK', 'PLAIN TEXT ONLY', 'No score']) {
  if (!SYSTEM.includes(required)) fail(`SYSTEM lost "${required}"`);
}
if (/[—–]/.test(SYSTEM)) fail('SYSTEM contains an em or en dash, which the model copies');

console.log(failed === 0 ? 'chat prompt: invariants hold' : `chat prompt: ${failed} failing`);
if (failed) Deno.exit(1);
