import { Input, BlobSource, ALL_FORMATS, AudioBufferSink, CanvasSink } from 'mediabunny';

// Decoded audio stays out of React state: a three-minute take is ~70 MB of
// floats, and it is only ever read by the analysis below and by export.
export interface Pcm {
  rate: number;
  channels: Float32Array[];
}
const pcmCache = new Map<string, Pcm>();
export const getPcm = (clipId: string) => pcmCache.get(clipId) ?? null;
export const dropPcm = (clipId: string) => pcmCache.delete(clipId);

export interface ClipInfo {
  duration: number;
  width: number;
  height: number;
  thumb: string | null;
}

export function openInput(file: File) {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

export async function readClip(clipId: string, file: File): Promise<ClipInfo & { pcm: Pcm | null }> {
  const input = openInput(file);
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error('No video in this file');
  if (!(await video.canDecode())) throw new Error('This browser cannot decode this video. Try Chrome.');
  const duration = await input.computeDuration();

  let thumb: string | null = null;
  try {
    const sink = new CanvasSink(video, { width: 240 });
    const frame = await sink.getCanvas(Math.min(0.4, duration / 2));
    if (frame) {
      const c = frame.canvas as HTMLCanvasElement | OffscreenCanvas;
      thumb = 'convertToBlob' in c
        ? URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }))
        : (c as HTMLCanvasElement).toDataURL('image/jpeg', 0.8);
    }
  } catch { /* a missing thumbnail is cosmetic */ }

  let pcm: Pcm | null = null;
  const audio = await input.getPrimaryAudioTrack();
  if (audio && (await audio.canDecode())) {
    const rate = audio.sampleRate;
    const nch = Math.min(2, audio.numberOfChannels);
    const total = Math.ceil(duration * rate);
    const channels = Array.from({ length: nch }, () => new Float32Array(total));
    for await (const { buffer, timestamp } of new AudioBufferSink(audio).buffers()) {
      const at = Math.round(timestamp * rate);
      for (let ch = 0; ch < nch; ch++) {
        const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
        const n = Math.min(src.length, total - at);
        if (n > 0 && at >= 0) channels[ch].set(src.subarray(0, n), at);
      }
    }
    pcm = { rate, channels };
    pcmCache.set(clipId, pcm);
  }

  return { duration, width: video.displayWidth, height: video.displayHeight, thumb, pcm };
}

export function mono(pcm: Pcm): Float32Array {
  if (pcm.channels.length === 1) return pcm.channels[0];
  const [l, r] = pcm.channels;
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}

// Loudness per 10 ms, in dB. Cheap, and the only thing that knows where the
// voice really starts and stops - Whisper's word edges routinely sit 100-300 ms
// out into silence.
export const ENV_HOP = 0.01;
export function envelope(pcm: Pcm): Float32Array {
  const m = mono(pcm);
  const hop = Math.round(pcm.rate * ENV_HOP);
  const n = Math.floor(m.length / hop);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const o = f * hop;
    for (let i = 0; i < hop; i++) sum += m[o + i] * m[o + i];
    env[f] = 10 * Math.log10(sum / hop + 1e-10);
  }
  return env;
}

// 16 kHz mono, which is what Whisper eats.
export async function to16k(pcm: Pcm): Promise<Float32Array> {
  const m = mono(pcm);
  const len = Math.ceil((m.length * 16000) / pcm.rate);
  const ctx = new OfflineAudioContext(1, len, 16000);
  const buf = ctx.createBuffer(1, m.length, pcm.rate);
  buf.copyToChannel(m as Float32Array<ArrayBuffer>, 0);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start();
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}
