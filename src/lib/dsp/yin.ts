// YIN pitch detection for the tuner.
export function yin(buf: Float32Array, sr: number, threshold = 0.12): { hz: number; clarity: number } | null {
  const W = Math.floor(buf.length / 2);
  const tauMax = Math.min(W, Math.floor(sr / 30));
  const tauMin = Math.floor(sr / 1500);
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.006) return null;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau];
    cmnd[tau] = (d[tau] * tau) / (run || 1);
  }
  let tau = -1;
  for (let t = Math.max(2, tauMin); t < tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1] ?? b;
  const den = a - 2 * b + c;
  const better = den !== 0 ? tau + (0.5 * (a - c)) / den : tau;
  return { hz: sr / better, clarity: 1 - b };
}

export interface Tuning {
  id: string;
  name: string;
  strings: { name: string; midi: number }[];
}

const n = (name: string, midi: number) => ({ name, midi });
export const TUNINGS: Tuning[] = [
  { id: 'guitar', name: 'Guitar · Standard', strings: [n('E', 40), n('A', 45), n('D', 50), n('G', 55), n('B', 59), n('E', 64)] },
  { id: 'dropd', name: 'Guitar · Drop D', strings: [n('D', 38), n('A', 45), n('D', 50), n('G', 55), n('B', 59), n('E', 64)] },
  { id: 'halfdown', name: 'Guitar · Half-step down', strings: [n('E♭', 39), n('A♭', 44), n('D♭', 49), n('G♭', 54), n('B♭', 58), n('E♭', 63)] },
  { id: 'openg', name: 'Guitar · Open G', strings: [n('D', 38), n('G', 43), n('D', 50), n('G', 55), n('B', 59), n('D', 62)] },
  { id: 'dadgad', name: 'Guitar · DADGAD', strings: [n('D', 38), n('A', 45), n('D', 50), n('G', 55), n('A', 57), n('D', 62)] },
  { id: 'bass4', name: 'Bass · 4-string', strings: [n('E', 28), n('A', 33), n('D', 38), n('G', 43)] },
  { id: 'bass5', name: 'Bass · 5-string', strings: [n('B', 23), n('E', 28), n('A', 33), n('D', 38), n('G', 43)] },
  { id: 'uke', name: 'Ukulele · GCEA', strings: [n('G', 67), n('C', 60), n('E', 64), n('A', 69)] },
  { id: 'violin', name: 'Violin · GDAE', strings: [n('G', 55), n('D', 62), n('A', 69), n('E', 76)] },
  { id: 'chromatic', name: 'Chromatic (any note)', strings: [] },
];
