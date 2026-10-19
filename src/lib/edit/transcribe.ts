import type { Word } from './types';
import { ENV_HOP } from './media';

// One worker for the page, so the model loads once however many clips arrive.
let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (w: Word[]) => void; reject: (e: Error) => void }>();
const downloadListeners = new Set<(loaded: number, total: number) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === 'download') { downloadListeners.forEach(l => l(m.loaded, m.total)); return; }
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === 'result') w.resolve(m.words);
    else w.reject(new Error(m.error));
  };
  return worker;
}

export function onModelDownload(fn: (loaded: number, total: number) => void) {
  downloadListeners.add(fn);
  return () => { downloadListeners.delete(fn); };
}

function run(audio: Float32Array, offset: number): Promise<Word[]> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'run', id, audio, offset });
  });
}

// Percentile of the envelope, used for the noise floor and the speech level.
function pct(env: Float32Array, p: number): number {
  const s = Float32Array.from(env).sort();
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? -100;
}

export function speechThreshold(env: Float32Array): number {
  const floor = pct(env, 0.1);
  const speech = pct(env, 0.9);
  return floor + Math.max(6, (speech - floor) * 0.3);
}

// Whisper only sees 30 s at a time and stitches longer audio with overlap,
// which is where it loses or doubles words. Cutting the take ourselves, in the
// quietest spot near every 24 s, means no stitching and a real progress bar.
function splitPoints(env: Float32Array, total: number): number[] {
  const pts = [0];
  const smooth = (f: number) => {
    let s = 0, n = 0;
    for (let k = f - 10; k <= f + 10; k++) if (k >= 0 && k < env.length) { s += env[k]; n++; }
    return s / Math.max(1, n);
  };
  let at = 0;
  while (total - at > 28) {
    let best = at + 24, bestV = Infinity;
    for (let t = at + 18; t <= at + 27; t += ENV_HOP * 2) {
      const v = smooth(Math.round(t / ENV_HOP));
      if (v < bestV) { bestV = v; best = t; }
    }
    pts.push(best);
    at = best;
  }
  pts.push(total);
  return pts;
}

export async function transcribe(audio16k: Float32Array, env: Float32Array, onProgress: (p: number) => void): Promise<Word[]> {
  const total = audio16k.length / 16000;
  const pts = splitPoints(env, total);
  const words: Word[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const piece = audio16k.subarray(Math.floor(pts[i] * 16000), Math.floor(pts[i + 1] * 16000));
    words.push(...(await run(piece.slice(), pts[i])));
    onProgress((i + 1) / (pts.length - 1));
  }
  return refine(words, env);
}

// Pull every word in to where the voice is, and drop words that sit entirely
// in silence (Whisper's "Thank you." at the end of a take).
export function refine(words: Word[], env: Float32Array): Word[] {
  const thr = speechThreshold(env);
  const loud = (t: number) => (env[Math.round(t / ENV_HOP)] ?? -100) >= thr;
  const out: Word[] = [];
  for (const w of words) {
    let s = w.s, e = Math.max(w.e, w.s + 0.05);
    let any = false;
    for (let t = s; t <= e; t += ENV_HOP) if (loud(t)) { any = true; break; }
    if (!any) continue;
    while (s < e - 0.08 && !loud(s)) s += ENV_HOP;
    while (e > s + 0.08 && !loud(e)) e -= ENV_HOP;
    out.push({ text: w.text, s: Math.max(0, s - 0.02), e: e + 0.03 });
  }
  // Keep them ordered and non-overlapping.
  for (let i = 1; i < out.length; i++) {
    if (out[i].s < out[i - 1].e) {
      const mid = (out[i].s + out[i - 1].e) / 2;
      out[i - 1].e = Math.max(out[i - 1].s + 0.04, mid);
      out[i].s = Math.max(out[i - 1].e, out[i].s);
    }
  }
  return out;
}
