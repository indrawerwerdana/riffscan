/// <reference lib="webworker" />
// AI stem separation (Demucs v4 "HTDemucs", 4 stems) running on the device with ONNX Runtime Web.
// WebGPU is used when available, otherwise WebAssembly (much slower).
import * as ort from 'onnxruntime-web/webgpu';
import { AudioSample, AudioSampleSource, BufferTarget, Mp3OutputFormat, Output } from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
// @ts-ignore vendored JS
import { separateTracks } from './demucs/apply.js';

export const STEMS = ['drums', 'bass', 'other', 'vocals'] as const;
export type StemName = (typeof STEMS)[number];

type InMsg = { left: Float32Array; right: Float32Array; modelUrl: string; bitrate?: number };

const post = (m: any, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer);

class HTDemucs {
  sources = [...STEMS];
  audioChannels = 2;
  samplerate = 44100;
  segment = 7.8;
  session!: ort.InferenceSession;
  validLength(length: number) {
    const training = Math.floor(this.segment * this.samplerate);
    if (training < length) throw new Error(`Chunk ${length} longer than training length ${training}`);
    return training;
  }
  async forward(mix: { data: Float32Array; shape: number[] }, magspec: { data: Float32Array; shape: number[] }) {
    const feeds: Record<string, ort.Tensor> = {
      [this.session.inputNames[0]]: new ort.Tensor('float32', mix.data, mix.shape),
      [this.session.inputNames[1]]: new ort.Tensor('float32', magspec.data, magspec.shape),
    };
    const out = await this.session.run(feeds);
    const x = out[this.session.outputNames[0]];
    const xt = out[this.session.outputNames[1]];
    return { outX: { data: x.data as Float32Array, shape: x.dims as number[] }, outXt: { data: xt.data as Float32Array, shape: xt.dims as number[] } };
  }
}

async function modelBytes(url: string): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open('riffscan-models-v1');
    const hit = await cache.match(url);
    if (hit) {
      post({ type: 'status', label: 'Loading the separation model', progress: null });
      return new Uint8Array(await hit.arrayBuffer());
    }
  } catch {
    cache = null;
  }
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Couldn't download the separation model (HTTP ${r.status}). Check the model address in Settings.`);
  const total = Number(r.headers.get('content-length')) || 174_000_000;
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    post({ type: 'status', label: 'Downloading the AI model (first time only, ~170 MB)', progress: Math.min(1, got / total) * 0.15 });
  }
  const bytes = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  if (bytes.length < 1_000_000) throw new Error('The model file looks wrong (too small). Check the model address in Settings.');
  try {
    await cache?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* quota — fine, we'll download again next time */
  }
  return bytes;
}

async function makeEncoder(bitrate: number) {
  const source = new AudioSampleSource({ codec: 'mp3', bitrate });
  const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() });
  output.addAudioTrack(source);
  await output.start();
  return { source, output };
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { left, right, modelUrl } = e.data;
  const bitrate = e.data.bitrate ?? 192_000;
  try {
    registerMp3Encoder();
    const gpu = (self.navigator as any).gpu;
    let adapter: any = null;
    try {
      adapter = gpu ? await gpu.requestAdapter() : null;
    } catch {
      adapter = null;
    }
    ort.env.wasm.numThreads = (self as any).crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
    const bytes = await modelBytes(modelUrl);
    post({ type: 'status', label: adapter ? 'Starting the AI on your GPU' : 'Starting the AI (no WebGPU — this will be slow)', progress: 0.16 });
    const model = new HTDemucs();
    try {
      model.session = await ort.InferenceSession.create(bytes, { executionProviders: adapter ? ['webgpu', 'wasm'] : ['wasm'] });
    } catch (err) {
      if (!adapter) throw err;
      model.session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    }
    post({ type: 'device', webgpu: !!adapter });

    const SR = 44100;
    const N = left.length;
    const WIN = SR * 45; // process in 45 s windows to keep memory low
    const CTX = SR * 4; // extra context on each side, discarded afterwards
    const windows = Math.max(1, Math.ceil(N / WIN));
    const enc = await Promise.all(STEMS.map(() => makeEncoder(bitrate)));
    const P = Math.min(1600, Math.max(200, Math.round((N / SR) * 6)));
    const peakAcc = STEMS.map(() => new Float64Array(P));
    const peakCnt = new Float64Array(P);
    const t0 = performance.now();
    // LAME adds 1105 samples of delay that browsers don't remove; drop them up front so stems line up with the mix.
    const DELAY = 1105;
    let written = 0;
    let nanCount = 0;

    for (let w = 0; w < windows; w++) {
      const s0 = w * WIN;
      const s1 = Math.min(N, s0 + WIN);
      const a = Math.max(0, s0 - CTX);
      const b = Math.min(N, s1 + CTX);
      const tracks = await separateTracks(
        model,
        { channelData: [left.slice(a, b), right.slice(a, b)], sampleRate: SR },
        (done: number, total: number) => {
          const p = (w + done / Math.max(1, total)) / windows;
          const elapsed = (performance.now() - t0) / 1000;
          const eta = p > 0.02 ? Math.round((elapsed / p) * (1 - p)) : null;
          post({ type: 'status', label: 'Separating vocals, drums, bass and other', progress: 0.16 + 0.8 * p, eta });
        },
        0.25,
      );
      const off = s0 - a;
      const len = s1 - s0;
      for (let k = 0; k < STEMS.length; k++) {
        const ch = tracks[STEMS[k]].channelData as Float32Array[];
        const L = ch[0].subarray(off, off + len);
        const R = ch[1].subarray(off, off + len);
        // Guard against rare non-finite model outputs (would turn into clicks or silence).
        for (let i = 0; i < len; i++) {
          if (!Number.isFinite(L[i])) { L[i] = 0; nanCount++; }
          if (!Number.isFinite(R[i])) { R[i] = 0; nanCount++; }
        }
        for (let i = 0; i < len; i += 64) {
          const p = Math.min(P - 1, Math.floor(((s0 + i) / N) * P));
          const v = (L[i] + R[i]) * 0.5;
          peakAcc[k][p] += v * v;
          if (k === 0) peakCnt[p]++;
        }
        const skip = w === 0 ? Math.min(DELAY, len) : 0;
        const n = len - skip;
        const planar = new Float32Array(n * 2);
        planar.set(L.subarray(skip), 0);
        planar.set(R.subarray(skip), n);
        const sample = new AudioSample({ data: planar, format: 'f32-planar', numberOfChannels: 2, sampleRate: SR, timestamp: written / SR });
        await enc[k].source.add(sample);
        sample.close();
        if (k === STEMS.length - 1) written += n;
      }
    }
    // Pad the tail so every stem keeps the song's full length.
    for (let k = 0; k < STEMS.length; k++) {
      const tail = new AudioSample({ data: new Float32Array(DELAY * 2), format: 'f32-planar', numberOfChannels: 2, sampleRate: SR, timestamp: written / SR });
      await enc[k].source.add(tail);
      tail.close();
    }

    post({ type: 'status', label: 'Saving the stems', progress: 0.97 });
    const out: Record<string, ArrayBuffer> = {};
    const peaks: Record<string, number[]> = {};
    const rms = STEMS.map((_, k) => Array.from(peakAcc[k], (s, i) => Math.sqrt(s / Math.max(1, peakCnt[i]))));
    // One shared scale so a quiet stem also looks quiet.
    let mx = 1e-6;
    for (const arr of rms) for (const v of arr) if (v > mx) mx = v;
    for (let k = 0; k < STEMS.length; k++) {
      await enc[k].output.finalize();
      out[STEMS[k]] = (enc[k].output.target as BufferTarget).buffer!;
      peaks[STEMS[k]] = rms[k].map((v) => Math.round(Math.min(1, v / mx) * 1000) / 1000);
    }
    post({ type: 'done', stems: out, peaks, seconds: (performance.now() - t0) / 1000, webgpu: !!adapter, nanCount }, Object.values(out));
  } catch (err: any) {
    post({ type: 'error', message: String(err?.message ?? err) });
  }
};
