// Main-thread wrapper around the Demucs worker.
import { decodeBlob } from '../audio/decode';
import type { StemName } from '../types';

export interface StemResult {
  blobs: Record<StemName, Blob>;
  peaks: Record<StemName, number[]>;
  seconds: number;
  webgpu: boolean;
  nanCount?: number;
}

export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function toStereo44k(buffer: AudioBuffer): Promise<[Float32Array, Float32Array]> {
  const SR = 44100;
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(buffer.duration * SR)), SR);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const r = await off.startRendering();
  return [r.getChannelData(0).slice(), r.getChannelData(1).slice()];
}

let current: Worker | null = null;
export function cancelSeparation() {
  current?.terminate();
  current = null;
}

export async function separateStems(blob: Blob, modelUrl: string, onProgress: (p: number | null, label: string, eta?: number | null) => void): Promise<StemResult> {
  onProgress(0, 'Preparing the audio');
  const buffer = await decodeBlob(blob);
  const [left, right] = await toStereo44k(buffer);
  const url = new URL(modelUrl, document.baseURI).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./separate.worker.ts', import.meta.url), { type: 'module' });
    current = worker;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') onProgress(m.progress, m.label, m.eta);
      else if (m.type === 'done') {
        worker.terminate();
        current = null;
        const blobs = {} as Record<StemName, Blob>;
        for (const k of Object.keys(m.stems) as StemName[]) blobs[k] = new Blob([m.stems[k]], { type: 'audio/mpeg' });
        resolve({ blobs, peaks: m.peaks, seconds: m.seconds, webgpu: m.webgpu, nanCount: m.nanCount });
      } else if (m.type === 'error') {
        worker.terminate();
        current = null;
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      current = null;
      reject(new Error(e.message || 'The separation worker crashed (often: not enough memory). Try a shorter song.'));
    };
    worker.postMessage({ left, right, modelUrl: url }, [left.buffer, right.buffer]);
  });
}
