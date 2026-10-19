import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, CanvasSink,
  getFirstEncodableVideoCodec, canEncodeAudio,
} from 'mediabunny';
import type { Clip, EditSettings, CapWord } from './types';
import { OUT_W, OUT_H, OUT_FPS } from './types';
import type { Timeline } from './timeline';
import { drawFrame, loadCaptionFonts, type CapGroup } from './compose';
import { getPcm, openInput } from './media';

const RATE = 48000;

// The finished Short, encoded in the browser: H.264 1080x1920 at 30 fps and
// AAC, frames drawn by the same drawFrame the preview uses.
export async function exportVideo(
  clips: Clip[],
  tl: Timeline,
  settings: EditSettings,
  caps: CapWord[],
  groups: CapGroup[],
  onProgress: (p: number, stage: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  await loadCaptionFonts();
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const codec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9'], { width: OUT_W, height: OUT_H });
  if (!codec) throw new Error('This browser cannot encode video. Try Chrome or Safari 17+.');
  const audioCodec = (await canEncodeAudio('aac')) ? 'aac' : 'opus';

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new CanvasSource(canvas, { codec, bitrate: 14e6, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: OUT_FPS });
  const audio = new AudioBufferSource({ codec: audioCodec, bitrate: 192e3 });
  output.addAudioTrack(audio);
  await output.start();

  // Audio first: it is quick, and a failure here should not cost a full video encode.
  onProgress(0, 'Audio');
  const pcm = buildAudio(clips, tl, settings.speed);
  const step = RATE; // one second per buffer
  for (let at = 0; at < pcm[0].length; at += step) {
    const n = Math.min(step, pcm[0].length - at);
    const buf = new AudioBuffer({ length: n, numberOfChannels: pcm.length, sampleRate: RATE });
    pcm.forEach((ch, i) => buf.copyToChannel(ch.subarray(at, at + n) as Float32Array<ArrayBuffer>, i));
    await audio.add(buf);
  }
  audio.close();

  // Video, one segment at a time, each read front to back.
  const sinks = new Map<number, CanvasSink>();
  const sinkFor = async (c: number) => {
    let s = sinks.get(c);
    if (s) return s;
    const track = await openInput(clips[c].file).getPrimaryVideoTrack();
    if (!track) throw new Error(`No video in ${clips[c].name}`);
    s = new CanvasSink(track, { height: Math.min(track.displayHeight, 2400), poolSize: 2 });
    sinks.set(c, s);
    return s;
  };

  const totalFrames = Math.max(1, Math.round(tl.duration * OUT_FPS));
  let frame = 0;
  for (const seg of tl.segments) {
    const first = Math.ceil(seg.out0 * OUT_FPS - 1e-6);
    const last = Math.ceil(seg.out1 * OUT_FPS - 1e-6); // exclusive
    if (last <= first) continue;
    const outTimes: number[] = [];
    for (let k = first; k < last; k++) outTimes.push(k / OUT_FPS);
    const srcTimes = outTimes.map(t => Math.min(seg.src1 - 0.001, seg.src0 + (t - seg.out0) * settings.speed));
    const sink = await sinkFor(seg.clip);
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(srcTimes)) {
      if (signal?.aborted) { await output.cancel(); throw new DOMException('Cancelled', 'AbortError'); }
      const t = outTimes[i++];
      const src = wrapped ? { image: wrapped.canvas, width: wrapped.canvas.width, height: wrapped.canvas.height } : null;
      drawFrame(ctx, src, seg, t, settings, caps, groups);
      await video.add(t, 1 / OUT_FPS);
      frame++;
      if (frame % 6 === 0) onProgress(frame / totalFrames, 'Video');
    }
  }
  video.close();
  onProgress(1, 'Finishing');
  await output.finalize();
  return new Blob([target.buffer!], { type: 'video/mp4' });
}

// The cut audio: every segment copied from its clip with a 6 ms fade at each
// edge (a hard cut mid-waveform clicks), joined, then time-stretched to the
// chosen speed without changing pitch.
function buildAudio(clips: Clip[], tl: Timeline, speed: number): Float32Array<ArrayBuffer>[] {
  const parts: Float32Array[][] = [];
  let total = 0;
  for (const seg of tl.segments) {
    const pcm = getPcm(clips[seg.clip].id);
    const len = Math.round((seg.src1 - seg.src0) * RATE);
    const chs = [new Float32Array(len), new Float32Array(len)];
    if (pcm) {
      const ratio = pcm.rate / RATE;
      for (let ch = 0; ch < 2; ch++) {
        const src = pcm.channels[Math.min(ch, pcm.channels.length - 1)];
        const o = seg.src0 * pcm.rate;
        for (let i = 0; i < len; i++) {
          const x = o + i * ratio;
          const j = Math.floor(x), f = x - j;
          chs[ch][i] = (src[j] ?? 0) * (1 - f) + (src[j + 1] ?? 0) * f;
        }
      }
      const fade = Math.min(Math.round(0.006 * RATE), len >> 1);
      for (let i = 0; i < fade; i++) {
        const g = i / fade;
        for (const c of chs) { c[i] *= g; c[len - 1 - i] *= g; }
      }
    }
    parts.push(chs);
    total += len;
  }
  let joined: Float32Array<ArrayBuffer>[] = [new Float32Array(total), new Float32Array(total)];
  let at = 0;
  for (const p of parts) { joined[0].set(p[0], at); joined[1].set(p[1], at); at += p[0].length; }
  if (Math.abs(speed - 1) > 0.001) joined = wsola(joined, speed);
  // Exactly as long as the video.
  const want = Math.round(tl.duration * RATE);
  return joined.map(c => {
    if (c.length === want) return c;
    const o = new Float32Array(want);
    o.set(c.subarray(0, want));
    return o;
  });
}

// Waveform-similarity overlap-add: speeds speech up without the chipmunk.
// Correlation is measured on a decimated mono mix, so a minute of audio takes
// well under a second.
function wsola(chs: Float32Array[], speed: number): Float32Array<ArrayBuffer>[] {
  const N = Math.round(0.04 * RATE);
  const Hs = N >> 1;
  const Ha = Hs * speed;
  const tol = Math.round(0.012 * RATE);
  const D = 8;
  const len = chs[0].length;
  const outLen = Math.ceil(len / speed) + N;
  const out = chs.map(() => new Float32Array(outLen));
  const norm = new Float32Array(outLen);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

  const mono = new Float32Array(Math.ceil(len / D));
  for (let i = 0; i < mono.length; i++) mono[i] = (chs[0][i * D] + chs[1][i * D]) * 0.5;
  const nd = Math.floor(N / D), td = Math.floor(tol / D);

  let prev = 0;
  for (let k = 0; ; k++) {
    const outPos = k * Hs;
    const nominal = Math.round(k * Ha);
    if (nominal + N >= len || outPos + N >= outLen) break;
    let pos = nominal;
    if (k > 0) {
      // Find the offset whose frame best continues the previous frame.
      const natural = Math.floor((prev + Hs) / D);
      let best = 0, bestC = -Infinity;
      for (let d = -td; d <= td; d++) {
        const a = Math.floor(nominal / D) + d;
        if (a < 0 || a + nd >= mono.length || natural + nd >= mono.length) continue;
        let c = 0;
        for (let i = 0; i < nd; i++) c += mono[a + i] * mono[natural + i];
        if (c > bestC) { bestC = c; best = d; }
      }
      pos = Math.max(0, Math.min(len - N - 1, nominal + best * D));
    }
    for (let ch = 0; ch < chs.length; ch++) {
      const src = chs[ch], dst = out[ch];
      for (let i = 0; i < N; i++) dst[outPos + i] += src[pos + i] * win[i];
    }
    for (let i = 0; i < N; i++) norm[outPos + i] += win[i];
    prev = pos;
  }
  for (let i = 0; i < outLen; i++) {
    const n = norm[i];
    if (n > 1e-3) for (const o of out) o[i] /= n;
  }
  return out;
}
