// Vibe editing: raw takes in, a cut Short out. Everything here runs in the
// browser except choosing takes, which is one LLM call (edit-plan).
//
// The edit is a set of kept WORDS, not a list of cuts. Whisper gives every
// word a time; the plan says which words survive; the cuts fall out of that.
// It is what makes "click a word to drop it" and "the model picked the last
// clean take" the same operation on the same data.

export interface Word {
  text: string;
  // Seconds in the clip's own timeline, after refine() pulled them in to where
  // the voice actually is (Whisper hands out time in silence too).
  s: number;
  e: number;
}

export interface Clip {
  id: string;
  file: File;
  name: string;
  url: string; // object URL for the preview <video>
  duration: number;
  width: number; // display size, rotation applied
  height: number;
  thumb: string | null;
  // RMS loudness per 10 ms frame, in dB. Cuts snap to its quiet points.
  env: Float32Array | null;
  words: Word[] | null;
  status: 'reading' | 'transcribing' | 'ready' | 'error';
  progress: number; // 0..1 while transcribing
  error?: string;
}

// A word's address across every clip: "clip index : word index".
export type WordKey = `${number}:${number}`;
export const wkey = (c: number, i: number): WordKey => `${c}:${i}`;

// One continuous piece of one clip, placed on the output timeline.
export interface Segment {
  clip: number;
  src0: number; // seconds in the clip
  src1: number;
  out0: number; // seconds in the finished video
  out1: number;
  zoom: number; // base framing for this piece
}

// A word as it appears in the finished video.
export interface CapWord {
  key: WordKey;
  text: string;
  t0: number; // output seconds
  t1: number;
  hot: boolean; // emphasised: drawn in the accent colour, may punch in
}

export type CaptionStyleId = 'pop' | 'bold' | 'word' | 'clean' | 'none';
export type Pace = 'natural' | 'tight';
export type ZoomMode = 'off' | 'cuts' | 'punch';
export type CapPos = 'middle' | 'lower';

export interface EditSettings {
  captions: CaptionStyleId;
  pace: Pace;
  speed: number; // 1, 1.1, 1.2
  zoom: ZoomMode;
  capPos: CapPos;
}

export const DEFAULT_SETTINGS: EditSettings = {
  captions: 'pop',
  pace: 'tight',
  speed: 1.1,
  zoom: 'cuts',
  capPos: 'middle',
};

// What edit-plan returns, already resolved to word keys.
export interface Plan {
  kept: Set<WordKey>;
  // Play order. edit-plan may move a take (a hook recorded last, said first);
  // a word with no rank plays after the ranked word before it in its clip.
  rank: Map<WordKey, number>;
  fixes: Record<WordKey, string>;
  hot: Set<WordKey>;
  note: string;
}

export const OUT_W = 1080;
export const OUT_H = 1920;
export const OUT_FPS = 30;
