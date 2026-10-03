// Small, dependency-free radix-2 FFT used by the analysis worker.

const cache = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array; win: Float64Array }>();

function tables(n: number) {
  let t = cache.get(n);
  if (t) return t;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
    rev[i] = r;
  }
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  t = { cos, sin, rev, win };
  cache.set(n, t);
  return t;
}

/**
 * Magnitude spectrum of a Hann-windowed frame.
 * `out` receives n/2+1 magnitudes.
 */
export function magnitudeSpectrum(
  signal: Float32Array,
  offset: number,
  n: number,
  re: Float64Array,
  im: Float64Array,
  out: Float32Array,
) {
  const { cos, sin, rev, win } = tables(n);
  for (let i = 0; i < n; i++) {
    const idx = offset + i;
    const v = idx >= 0 && idx < signal.length ? signal[idx] : 0;
    const r = rev[i];
    re[r] = v * win[i];
    im[r] = 0;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j;
        const b = a + half;
        const tr = re[b] * cos[k] - im[b] * sin[k];
        const ti = re[b] * sin[k] + im[b] * cos[k];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  for (let i = 0; i <= n / 2; i++) out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
}
