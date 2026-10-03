/// <reference lib="webworker" />
// In-browser Whisper (open source, via transformers.js). Runs fully on the device.
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;

let asr: any = null;
let loaded = '';

async function load(model: string) {
  if (asr && loaded === model) return asr;
  const progress_callback = (p: any) => {
    if (p.status === 'progress' && typeof p.progress === 'number') postMessage({ type: 'load', file: p.file, progress: p.progress / 100 });
  };
  const gpu = (self.navigator as any).gpu;
  let adapter = null;
  try {
    adapter = gpu ? await gpu.requestAdapter() : null;
  } catch {
    adapter = null;
  }
  try {
    asr = await pipeline('automatic-speech-recognition', model, {
      device: adapter ? 'webgpu' : 'wasm',
      dtype: adapter ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
      progress_callback,
    } as any);
  } catch (err) {
    if (!adapter) throw err;
    asr = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback } as any);
  }
  loaded = model;
  return asr;
}

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; model: string; language: string }>) => {
  const { audio, model, language } = e.data;
  try {
    const run = await load(model);
    postMessage({ type: 'status', label: 'Transcribing lyrics' });
    const opts: any = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
    if (language && language !== 'auto') {
      opts.language = language;
      opts.task = 'transcribe';
    }
    let out: any;
    let segmentLevel = false;
    try {
      out = await run(audio, opts);
    } catch {
      out = await run(audio, { ...opts, return_timestamps: true });
      segmentLevel = true;
    }
    postMessage({ type: 'done', chunks: out.chunks ?? [], text: out.text ?? '', segmentLevel });
  } catch (err: any) {
    postMessage({ type: 'error', message: String(err?.message ?? err) });
  }
};
