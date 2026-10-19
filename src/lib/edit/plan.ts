import type { Clip, Plan, WordKey } from './types';
import { wkey } from './types';
import { getSessionToken } from '../supabase';

// A pause this long between two words is where a take usually restarts, and
// the model is told so.
const RESTART_GAP = 0.7;

// Everything kept, in recording order: what you get before (or without) the model.
export function keepAll(clips: Clip[]): Plan {
  const kept = new Set<WordKey>();
  clips.forEach((c, ci) => c.words?.forEach((_, i) => kept.add(wkey(ci, i))));
  return { kept, rank: new Map(), fixes: {}, hot: new Set(), note: '' };
}

export interface RawPlan {
  keep?: { clip: number; from: number; to: number }[];
  fix?: { clip: number; i: number; text: string }[];
  hot?: { clip: number; i: number }[];
  note?: string;
}

export async function requestPlan(clips: Clip[], script: string, instructions: string): Promise<Plan> {
  const token = await getSessionToken();
  if (!token) throw new Error('Sign in to plan the cut');
  const body = {
    script,
    instructions,
    clips: clips.map(c => {
      const words = c.words ?? [];
      const pauses: number[] = [];
      words.forEach((w, i) => { if (i > 0 && w.s - words[i - 1].e >= RESTART_GAP) pauses.push(i); });
      return { words: words.map(w => w.text), pauses };
    }),
  };
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Planning failed (${res.status})`);
  return resolvePlan(clips, data as RawPlan);
}

export function resolvePlan(clips: Clip[], raw: RawPlan): Plan {
  const kept = new Set<WordKey>();
  const rank = new Map<WordKey, number>();
  const valid = (c: number, i: number) => Number.isInteger(c) && Number.isInteger(i) && !!clips[c]?.words && i >= 0 && i < clips[c].words!.length;
  (raw.keep ?? []).forEach((r, n) => {
    const from = Math.min(Number(r.from), Number(r.to)), to = Math.max(Number(r.from), Number(r.to));
    r = { ...r, clip: Number(r.clip) };
    for (let i = from; i <= to; i++) {
      if (!valid(r.clip, i)) continue;
      const k = wkey(r.clip, i);
      if (kept.has(k)) continue; // a word plays once, however the ranges overlap
      kept.add(k);
      rank.set(k, n * 1e5 + i);
    }
  });
  if (kept.size === 0) throw new Error(`The plan kept nothing.${raw.note ? ` ${raw.note}` : ''}`);
  const fixes: Record<WordKey, string> = {};
  for (const f of raw.fix ?? []) if (valid(Number(f.clip), Number(f.i)) && f.text?.trim()) fixes[wkey(Number(f.clip), Number(f.i))] = f.text.trim();
  const hot = new Set<WordKey>();
  for (const h of raw.hot ?? []) if (valid(Number(h.clip), Number(h.i))) hot.add(wkey(Number(h.clip), Number(h.i)));
  return { kept, rank, fixes, hot, note: raw.note ?? '' };
}
