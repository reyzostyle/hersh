/// <reference lib="webworker" />
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Whisper in the browser, word timestamps on. A worker so a minute of
// inference never freezes the page; the model (~200 MB) is fetched once and
// then served from the browser cache.
env.allowLocalModels = false;

const MODEL = 'onnx-community/whisper-base.en_timestamped';

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  const gpu = !!(self.navigator as Navigator & { gpu?: unknown }).gpu;
  const files = new Map<string, { loaded: number; total: number }>();
  const opts = {
    device: gpu ? 'webgpu' : 'wasm',
    dtype: gpu
      ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
      : { encoder_model: 'q8', decoder_model_merged: 'q8' },
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0, total = 0;
      files.forEach(f => { loaded += f.loaded; total += f.total; });
      self.postMessage({ type: 'download', loaded, total });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await pipeline('automatic-speech-recognition', MODEL, opts as any)) as AutomaticSpeechRecognitionPipeline;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type !== 'run') return;
  try {
    if (!asr) asr = load();
    const model = await asr;
    const out = await model(msg.audio as Float32Array, { return_timestamps: 'word' }) as {
      chunks?: { text: string; timestamp: [number, number | null] }[];
    };
    const words = (out.chunks ?? [])
      .map(c => ({ text: c.text.trim(), s: c.timestamp[0] + msg.offset, e: (c.timestamp[1] ?? c.timestamp[0] + 0.3) + msg.offset }))
      .filter(w => w.text.length > 0);
    self.postMessage({ type: 'result', id: msg.id, words });
  } catch (err) {
    asr = null;
    self.postMessage({ type: 'error', id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
};
