import type { Clip, EditSettings, Plan, Segment, CapWord, WordKey } from './types';
import { wkey } from './types';
import { ENV_HOP } from './media';
import { speechThreshold } from './transcribe';

export interface Timeline {
  segments: Segment[];
  caps: CapWord[];
  duration: number;
}

// How much breath survives around and between words. Tight is the Shorts
// default: a pause longer than ~0.2 s reads as dead air on a phone.
const PACE = {
  natural: { maxGap: 0.45, lead: 0.12, tail: 0.18 },
  tight: { maxGap: 0.2, lead: 0.06, tail: 0.1 },
};

// The quietest 10 ms frame in [a, b], so a cut lands between sounds, not on one.
function quietest(env: Float32Array | null, a: number, b: number, fallback: number): number {
  if (!env || b <= a) return fallback;
  let best = fallback, bestV = Infinity;
  for (let t = a; t <= b; t += ENV_HOP) {
    const v = env[Math.round(t / ENV_HOP)] ?? 0;
    if (v < bestV) { bestV = v; best = t; }
  }
  return best;
}

// Whisper's word edges are routinely 0.2-0.4 s late or early, so a cut placed
// on them clips the first syllable ("-viously"). The edge is pushed out to
// where the sound actually starts or stops, but never past the neighbouring
// word and never further than a syllable or two: a stutter Whisper did not
// write down is still sound, and it should stay cut.
const REACH_BACK = 0.5;
const REACH_FWD = 0.4;

const thresholds = new WeakMap<Float32Array, number>();
function loudness(env: Float32Array | null) {
  if (!env) return () => false;
  let thr = thresholds.get(env);
  if (thr === undefined) { thr = speechThreshold(env); thresholds.set(env, thr); }
  const t0 = thr;
  return (t: number) => (env[Math.round(t / ENV_HOP)] ?? -100) >= t0;
}

export function buildTimeline(clips: Clip[], plan: Plan, settings: EditSettings): Timeline {
  const p = PACE[settings.pace];
  const pieces: { clip: number; src0: number; src1: number; rank: number; lastRank: number; words: { key: WordKey; i: number }[] }[] = [];

  clips.forEach((clip, c) => {
    const words = clip.words;
    if (!words) return;
    const loud = loudness(clip.env);
    const startOf = (i: number) => {
      const lo = Math.max(i > 0 ? words[i - 1].e + 0.02 : 0, words[i].s - REACH_BACK);
      let x = words[i].s;
      while (x - ENV_HOP > lo && loud(x - ENV_HOP)) x -= ENV_HOP;
      const from = Math.max(lo, x - p.lead);
      return Math.max(0, quietest(clip.env, from, x, from));
    };
    const endOf = (i: number) => {
      const hi = Math.min(i < words.length - 1 ? words[i + 1].s - 0.02 : clip.duration, words[i].e + REACH_FWD);
      let x = words[i].e;
      while (x + ENV_HOP < hi && loud(x + ENV_HOP)) x += ENV_HOP;
      const to = Math.min(hi, x + p.tail);
      return Math.max(words[i].e, quietest(clip.env, x, to, to));
    };

    let cur: (typeof pieces)[number] | null = null;
    // Unranked clips go after everything the plan ordered, in clip order.
    let lastRank = 1e9 + c * 1e5;
    let prevRank = -Infinity;
    for (let i = 0; i < words.length; i++) {
      const key = wkey(c, i);
      const r = plan.rank.get(key);
      const rank = r ?? lastRank + 0.001;
      lastRank = rank;
      if (!plan.kept.has(key)) { cur = null; prevRank = rank; continue; }
      // A jump in rank means the plan split here, even between neighbours.
      const contiguous = rank > prevRank && rank - prevRank <= 1.01;
      prevRank = rank;
      const joinable = cur && contiguous && plan.kept.has(wkey(c, i - 1)) && words[i].s - words[i - 1].e <= p.maxGap;
      if (joinable && cur) {
        cur.words.push({ key, i });
        cur.lastRank = rank;
      } else {
        cur = { clip: c, src0: startOf(i), src1: 0, rank, lastRank: rank, words: [{ key, i }] };
        pieces.push(cur);
      }
    }
    const mine = pieces.filter(pc => pc.clip === c);
    for (const pc of mine) pc.src1 = endOf(pc.words[pc.words.length - 1].i);
    // Two pieces split by a pause that turned out to be voiced both reach into
    // it, and played back to back that sound would be heard twice. If they
    // play in order they are one piece; if not, they meet at the quietest point.
    for (let k = mine.length - 1; k > 0; k--) {
      const a = mine[k - 1], b = mine[k];
      if (b.words[0].i !== a.words[a.words.length - 1].i + 1 || a.src1 <= b.src0) continue;
      if (b.rank > a.lastRank && b.rank - a.lastRank <= 1.01) {
        a.words.push(...b.words);
        a.src1 = b.src1;
        a.lastRank = b.lastRank;
        pieces.splice(pieces.indexOf(b), 1);
      } else {
        const cut = quietest(clip.env, b.src0, a.src1, (a.src1 + b.src0) / 2);
        a.src1 = cut;
        b.src0 = cut;
      }
    }
  });

  pieces.sort((a, b) => a.rank - b.rank);

  const segments: Segment[] = [];
  const caps: CapWord[] = [];
  let out = 0;
  pieces.forEach((pc, n) => {
    const len = (pc.src1 - pc.src0) / settings.speed;
    if (len <= 0.02) return;
    const zoom = settings.zoom === 'off' ? 1 : n % 2 === 0 ? 1 : 1.12;
    const seg: Segment = { clip: pc.clip, src0: pc.src0, src1: pc.src1, out0: out, out1: out + len, zoom };
    segments.push(seg);
    const words = clips[pc.clip].words!;
    for (const { key, i } of pc.words) {
      const w = words[i];
      caps.push({
        key,
        text: plan.fixes[key] ?? w.text,
        t0: out + (Math.max(w.s, pc.src0) - pc.src0) / settings.speed,
        t1: out + (Math.min(w.e, pc.src1) - pc.src0) / settings.speed,
        hot: plan.hot.has(key),
      });
    }
    out += len;
  });

  return { segments, caps, duration: out };
}

export function segmentAt(segments: Segment[], t: number): number {
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < segments[mid].out0) hi = mid - 1;
    else if (t >= segments[mid].out1) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(segments.length - 1, lo));
}

export function srcTime(seg: Segment, t: number, speed: number): number {
  return seg.src0 + (t - seg.out0) * speed;
}
