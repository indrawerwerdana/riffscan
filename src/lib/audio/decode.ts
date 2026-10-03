// Decoding, resampling and WAV encoding helpers (main thread).
import type { Analysis } from '../types';
import type { AnalyzeOptions } from '../dsp/analyze';

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer();
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AC();
  try {
    return await ctx.decodeAudioData(data);
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Downmix to mono and resample with an OfflineAudioContext. */
export async function toMono(buffer: AudioBuffer, sampleRate: number): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * sampleRate));
  const off = new OfflineAudioContext(1, length, sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}

export function encodeWav16(x: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + x.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

export function runAnalysis(samples: Float32Array, sr: number, onProgress: (p: number, label: string) => void, opts?: AnalyzeOptions): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../dsp/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.p, m.label);
      else if (m.type === 'done') {
        worker.terminate();
        resolve(m.result as Analysis);
      } else if (m.type === 'error') {
        worker.terminate();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Analysis worker failed'));
    };
    const transfer: Transferable[] = [samples.buffer];
    if (opts?.harmonic) transfer.push(opts.harmonic.buffer);
    if (opts?.drums) transfer.push(opts.drums.buffer);
    worker.postMessage({ samples, sr, opts }, transfer);
  });
}
