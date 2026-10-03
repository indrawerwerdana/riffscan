/// <reference lib="webworker" />
import { analyze } from './analyze';

self.onmessage = (e: MessageEvent<{ samples: Float32Array; sr: number; opts?: import("./analyze").AnalyzeOptions }>) => {
  try {
    const { samples, sr, opts } = e.data;
    const result = analyze(samples, sr, (p, label) => postMessage({ type: "progress", p, label }), opts ?? {});
    postMessage({ type: 'done', result });
  } catch (err) {
    postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
