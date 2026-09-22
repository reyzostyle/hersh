// Cases for the write-request guard in _shared/chat-prompt.ts.
//
// Run: npm run test:routing (needs deno, which the edge functions use anyway).
// No session, no model call, no credits - this is the part of the routing that
// is allowed to be deterministic, and the one that keeps costing real credits
// when it is wrong.

import { looksLikeAWriteRequest } from '../supabase/functions/_shared/chat-prompt.ts';

// Requests to write something. These must never reach a score.
const REQUESTS = [
  'create me a script out of the last saved idea',
  'Create a script from my last saved idea',
  'write me a hook for this',
  'can you write a script for it?',
  'give me three openings',
  'make a hook from my last video',
  'turn this idea into a script',
  'generate 5 title options',
  'rewrite the hook please',
  'напиши скрипт по последней идее',
  'сделай хук для этого',
];

// Texts handed over to be judged, and questions that are not requests. These
// must be left to the model's own routing.
const NOT_REQUESTS = [
  'POV: you just quit your job',
  'how do i write a better hook',
  'why did this flop',
  'is this hook good: nobody talks about this',
  // Opens with an imperative but is the video itself, and runs long.
  'Write this down before you forget it. The first thing you do when you open the game is head straight for the village, because that is where the loot is. Then you dig down exactly eleven blocks, place a torch, and wait for the sound. If you hear it, you are standing on a mineshaft and the whole run just got easier. Most people quit here, which is why most people never find one.',
  'hey',
  'what should i post tomorrow',
];

let failed = 0;
for (const t of REQUESTS) {
  if (!looksLikeAWriteRequest(t)) { console.error(`MISSED a request: ${t}`); failed++; }
}
for (const t of NOT_REQUESTS) {
  if (looksLikeAWriteRequest(t)) { console.error(`WRONGLY called a request: ${t}`); failed++; }
}

console.log(failed === 0
  ? `routing guard: ${REQUESTS.length + NOT_REQUESTS.length} cases pass`
  : `routing guard: ${failed} failing`);
if (failed) Deno.exit(1);
