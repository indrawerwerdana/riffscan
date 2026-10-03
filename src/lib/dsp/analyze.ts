// Core audio analysis: tempo, beats, tuning, chords, key, sections, drums.
// Pure TypeScript so it runs in a Web Worker (and in Node for tests).

import { magnitudeSpectrum } from './fft';
import type { Analysis, ChordSeg, DrumBar, Section } from '../types';
import { INTERVALS, QUALITIES, isMinorish, type Key, type Quality } from '../music/theory';

type Progress = (p: number, label: string) => void;

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function mean(a: ArrayLike<number>) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
}

function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function pearson(a: number[], b: number[]) {
  const ma = mean(a);
  const mb = mean(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * db || 1);
}

function normL2(v: Float32Array | number[]) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / s;
  return out;
}

function cosine(a: Float32Array, b: Float32Array) {
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    n += a[i] * b[i];
    da += a[i] * a[i];
    db += b[i] * b[i];
  }
  return n / (Math.sqrt(da * db) || 1);
}

/** Moving-average smoothing. */
function smooth(a: Float32Array, w: number) {
  const out = new Float32Array(a.length);
  let s = 0;
  const h = Math.floor(w / 2);
  for (let i = 0; i < a.length + h; i++) {
    if (i < a.length) s += a[i];
    if (i - w >= 0) s -= a[i - w];
    const c = i - h;
    if (c >= 0 && c < a.length) out[c] = s / Math.min(w, i + 1);
  }
  return out;
}

export interface AnalyzeOptions {
  /** Separated harmonic stems (bass + other), used for chroma/chords. */
  harmonic?: Float32Array;
  /** Separated drum stem, used for drum transcription. */
  drums?: Float32Array;
  /** Chord vocabulary: full (7ths, sus, dim, aug, slash) or triads only. */
  vocabulary?: 'full' | 'triads';
}

// Prior (log units) that keeps simple triads unless the evidence for a richer chord is clear.
const PRIOR: Record<Quality, number> = { maj: 0, min: 0, '7': -0.9, m7: -0.9, maj7: -1.1, sus4: -1.3, sus2: -1.5, dim: -1.7, aug: -2.2 };

export function analyze(x: Float32Array, sr: number, progress: Progress = () => {}, opts: AnalyzeOptions = {}): Analysis {
  const duration = x.length / sr;
  const harm = opts.harmonic && opts.harmonic.length ? opts.harmonic : x;
  const drumSrc = opts.drums && opts.drums.length ? opts.drums : null;
  const QS: Quality[] = opts.vocabulary === 'triads' ? ['maj', 'min'] : QUALITIES;

  // ---------- 1. Onset / band-energy spectrogram ----------
  progress(0.02, 'Listening to the rhythm');
  const N1 = 1024;
  const H1 = 512;
  const fps = sr / H1;
  const F1 = Math.max(1, Math.ceil(x.length / H1));
  const re = new Float64Array(4096);
  const im = new Float64Array(4096);
  const mag1 = new Float32Array(N1 / 2 + 1);
  const prevLog = new Float32Array(N1 / 2 + 1);
  const onset = new Float32Array(F1);
  const kickE = new Float32Array(F1);
  const snareE = new Float32Array(F1);
  const hatE = new Float32Array(F1);
  const totalE = new Float32Array(F1);
  const binHz1 = sr / N1;
  const band = (lo: number, hi: number) => [Math.max(1, Math.floor(lo / binHz1)), Math.min(N1 / 2, Math.ceil(hi / binHz1))];
  const [k0, k1] = band(30, 100);
  const [s0, s1] = band(1800, 5000);
  const [h0, h1] = band(6500, Math.min(11000, sr / 2 - 100));
  const magD = new Float32Array(N1 / 2 + 1);
  for (let f = 0; f < F1; f++) {
    magnitudeSpectrum(x, f * H1 - N1 / 2, N1, re, im, mag1);
    if (drumSrc) magnitudeSpectrum(drumSrc, f * H1 - N1 / 2, N1, re, im, magD);
    const md = drumSrc ? magD : mag1;
    let flux = 0, ke = 0, se = 0, he = 0, te = 0;
    for (let k = 1; k <= N1 / 2; k++) {
      const m = mag1[k];
      const lg = Math.log1p(100 * m);
      const d = lg - prevLog[k];
      if (d > 0) flux += d;
      prevLog[k] = lg;
      te += m * m;
      const e = md[k] * md[k];
      if (k >= k0 && k <= k1) ke += e;
      else if (k >= s0 && k <= s1) se += e;
      else if (k >= h0 && k <= h1) he += e;
    }
    onset[f] = flux;
    kickE[f] = Math.log10(1e-9 + ke);
    snareE[f] = Math.log10(1e-9 + se);
    hatE[f] = Math.log10(1e-9 + he);
    totalE[f] = te;
    if (f % 2000 === 0) progress(0.02 + 0.18 * (f / F1), 'Listening to the rhythm');
  }

  // Normalised onset envelope.
  const local = smooth(onset, Math.max(3, Math.round(fps * 0.4)));
  const on = new Float32Array(F1);
  for (let i = 0; i < F1; i++) on[i] = Math.max(0, onset[i] - local[i]);
  {
    let s = 0;
    for (let i = 0; i < F1; i++) s += on[i] * on[i];
    const sd = Math.sqrt(s / F1) || 1;
    for (let i = 0; i < F1; i++) on[i] /= sd;
  }

  // ---------- 2. Tempo ----------
  progress(0.22, 'Finding the tempo');
  const lagMin = Math.max(2, Math.floor((fps * 60) / 210));
  const lagMax = Math.min(F1 - 2, Math.ceil((fps * 60) / 52));
  // Lightly blurred envelope so non-integer beat periods still correlate.
  const onB = new Float32Array(F1);
  for (let i = 0; i < F1; i++) {
    let s = 0;
    for (let j = -3; j <= 3; j++) {
      const k = i + j;
      if (k >= 0 && k < F1) s += on[k] * Math.exp(-0.5 * (j / 1.4) ** 2);
    }
    onB[i] = s;
  }
  const ac = new Float32Array(lagMax * 3 + 3);
  for (let l = 2; l <= Math.min(lagMax * 3, F1 - 2); l++) {
    let s = 0;
    for (let t = 0; t + l < F1; t++) s += onB[t] * onB[t + l];
    ac[l] = s / (F1 - l);
  }
  let bestLag = Math.round((fps * 60) / 120);
  let bestScore = -Infinity;
  const scoreLag = (l: number) => {
    const bpm = (60 * fps) / l;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 105) / 0.8) ** 2);
    const comb = ac[l] + 0.25 * (ac[2 * l] || 0) + 0.25 * (ac[Math.round(l / 2)] || 0);
    return comb * w;
  };
  for (let l = lagMin; l <= lagMax; l++) {
    const s = scoreLag(l);
    if (s > bestScore) {
      bestScore = s;
      bestLag = l;
    }
  }
  // Parabolic refinement.
  let period = bestLag;
  if (bestLag > lagMin && bestLag < lagMax) {
    const a = scoreLag(bestLag - 1), b = scoreLag(bestLag), c = scoreLag(bestLag + 1);
    const den = a - 2 * b + c;
    if (den !== 0) period = bestLag + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  }
  let bpm = (60 * fps) / period;

  // ---------- 3. Beat tracking (dynamic programming) ----------
  progress(0.3, 'Tracking the beat');
  const gw = Math.max(1, Math.round(period / 16));
  const localScore = new Float32Array(F1);
  for (let i = 0; i < F1; i++) {
    let s = 0, wsum = 0;
    for (let j = -2 * gw; j <= 2 * gw; j++) {
      const k = i + j;
      if (k < 0 || k >= F1) continue;
      const w = Math.exp(-0.5 * (j / gw) ** 2);
      s += on[k] * w;
      wsum += w;
    }
    localScore[i] = s / wsum;
  }
  const cum = new Float32Array(F1);
  const back = new Int32Array(F1).fill(-1);
  const tight = 100;
  const wMin = Math.round(period / 2);
  const wMax = Math.round(period * 2);
  for (let i = 0; i < F1; i++) {
    let best = -Infinity, arg = -1;
    for (let d = wMin; d <= wMax; d++) {
      const j = i - d;
      if (j < 0) break;
      const v = cum[j] - tight * Math.log(d / period) ** 2;
      if (v > best) {
        best = v;
        arg = j;
      }
    }
    cum[i] = localScore[i] + (arg >= 0 ? Math.max(0, best) : 0);
    back[i] = arg >= 0 && best > 0 ? arg : -1;
  }
  let last = F1 - 1;
  {
    let best = -Infinity;
    for (let i = Math.max(0, F1 - Math.round(period * 1.5)); i < F1; i++) {
      if (cum[i] > best) {
        best = cum[i];
        last = i;
      }
    }
  }
  let beatFrames: number[] = [];
  for (let i = last; i >= 0; i = back[i]) {
    beatFrames.push(i);
    if (back[i] < 0) break;
  }
  beatFrames.reverse();

  // Trim beats in silence at the edges.
  const maxE = Math.max(...Array.from(smooth(totalE, Math.round(fps))));
  const eSm = smooth(totalE, Math.round(fps * 0.5));
  const loud = (f: number) => eSm[Math.min(F1 - 1, f)] > maxE * 0.003;
  while (beatFrames.length && !loud(beatFrames[0])) beatFrames.shift();
  while (beatFrames.length && !loud(beatFrames[beatFrames.length - 1])) beatFrames.pop();

  let beats = beatFrames.map((f) => (f * H1) / sr);
  if (beats.length < 8) {
    // Fallback grid for very short or beat-less audio.
    bpm = 120;
    beats = [];
    for (let t = 0; t < duration; t += 0.5) beats.push(t);
  } else {
    // Extend the grid backwards over a quiet intro so chords there still get bars.
    const p = (60 / bpm);
    while (beats[0] - p > 0.25) beats.unshift(beats[0] - p);
  }
  const beatPeriod = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  bpm = 60 / beatPeriod;

  // ---------- 4. Chroma spectrogram + tuning ----------
  progress(0.4, 'Reading the harmony');
  const N2 = 4096;
  const H2 = 2048;
  const F2 = Math.max(1, Math.ceil(x.length / H2));
  const binHz2 = sr / N2;
  const mag2 = new Float32Array(N2 / 2 + 1);

  // Tuning estimate from spectral peaks.
  let cs = 0, sn = 0;
  const tuneStep = Math.max(1, Math.floor(F2 / 300));
  for (let f = 0; f < F2; f += tuneStep) {
    magnitudeSpectrum(harm, f * H2 - N2 / 2, N2, re, im, mag2);
    let mx = 0;
    for (let k = 1; k < N2 / 2; k++) if (mag2[k] > mx) mx = mag2[k];
    const lo = Math.floor(100 / binHz2), hi = Math.floor(1600 / binHz2);
    for (let k = lo; k < hi; k++) {
      const m = mag2[k];
      if (m < mx * 0.15 || m < mag2[k - 1] || m < mag2[k + 1]) continue;
      const a = Math.log(mag2[k - 1] + 1e-9), b = Math.log(m + 1e-9), c = Math.log(mag2[k + 1] + 1e-9);
      const den = a - 2 * b + c;
      const off = den !== 0 ? (0.5 * (a - c)) / den : 0;
      const hz = (k + off) * binHz2;
      const midi = 69 + 12 * Math.log2(hz / 440);
      const dev = midi - Math.round(midi);
      cs += m * Math.cos(2 * Math.PI * dev);
      sn += m * Math.sin(2 * Math.PI * dev);
    }
  }
  const tuning = cs || sn ? Math.atan2(sn, cs) / (2 * Math.PI) : 0; // semitones
  const tuningCents = Math.round(tuning * 100);

  const pcTreble = new Int8Array(N2 / 2 + 1).fill(-1);
  const pcBass = new Int8Array(N2 / 2 + 1).fill(-1);
  for (let k = 1; k <= N2 / 2; k++) {
    const hz = k * binHz2;
    const midi = 69 + 12 * Math.log2(hz / 440) - tuning;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    if (hz >= 120 && hz <= 2200) pcTreble[k] = pc;
    if (hz >= 40 && hz <= 220) pcBass[k] = pc;
  }
  const chroma = new Float32Array(F2 * 12);
  const bassChroma = new Float32Array(F2 * 12);
  const frameE = new Float32Array(F2);
  for (let f = 0; f < F2; f++) {
    magnitudeSpectrum(harm, f * H2 - N2 / 2, N2, re, im, mag2);
    let e = 0;
    for (let k = 1; k <= N2 / 2; k++) {
      const m2 = mag2[k] * mag2[k];
      e += m2;
      const pt = pcTreble[k];
      if (pt >= 0) chroma[f * 12 + pt] += m2;
      const pb = pcBass[k];
      if (pb >= 0) bassChroma[f * 12 + pb] += m2;
    }
    for (let i = 0; i < 12; i++) {
      chroma[f * 12 + i] = Math.sqrt(chroma[f * 12 + i]);
      bassChroma[f * 12 + i] = Math.sqrt(bassChroma[f * 12 + i]);
    }
    frameE[f] = e;
    if (f % 300 === 0) progress(0.4 + 0.25 * (f / F2), 'Reading the harmony');
  }

  // ---------- 5. Beat-synchronous features ----------
  progress(0.66, 'Naming the chords');
  const B = beats.length;
  const bt: Float32Array[] = [];
  const bb: Float32Array[] = [];
  const bE: number[] = [];
  const kickAtBeat: number[] = [];
  for (let i = 0; i < B; i++) {
    const t0 = beats[i];
    const t1 = i + 1 < B ? beats[i + 1] : Math.min(duration, t0 + beatPeriod);
    let f0 = Math.floor((t0 * sr) / H2);
    let f1 = Math.ceil((t1 * sr) / H2);
    f0 = Math.max(0, Math.min(F2 - 1, f0));
    f1 = Math.max(f0 + 1, Math.min(F2, f1));
    const c = new Float32Array(12);
    const cb = new Float32Array(12);
    let e = 0;
    for (let f = f0; f < f1; f++) {
      for (let k = 0; k < 12; k++) {
        c[k] += chroma[f * 12 + k];
        cb[k] += bassChroma[f * 12 + k];
      }
      e += frameE[f];
    }
    bt.push(normL2(c));
    let mb = 0;
    for (let k = 0; k < 12; k++) mb = Math.max(mb, cb[k]);
    for (let k = 0; k < 12; k++) cb[k] = mb > 0 ? cb[k] / mb : 0;
    bb.push(cb);
    bE.push(e / (f1 - f0));
    const kf = Math.round((t0 * sr) / H1);
    let kmax = -9;
    for (let j = kf - 2; j <= kf + 2; j++) if (j > 0 && j < F1) kmax = Math.max(kmax, kickE[j] - kickE[j - 1]);
    kickAtBeat.push(kmax);
  }
  const medE = median(bE);

  // ---------- 6. Chord recognition (template matching + Viterbi) ----------
  // States: 12 roots × qualities, plus one "no chord" state (the last).
  const NQ = QS.length;
  const NC = 12 * NQ;
  const S = NC + 1;
  const stQ = (s: number) => QS[Math.floor(s / 12)];
  const templates: Float32Array[] = [];
  for (let s = 0; s < NC; s++) {
    const r = s % 12;
    const iv = INTERVALS[stQ(s)];
    const w = [1, 0.9, 0.82, 0.72];
    const t = new Float32Array(12);
    iv.forEach((d, j) => (t[(r + d) % 12] = w[j]));
    templates.push(normL2(t));
  }
  const emis: Float32Array[] = [];
  for (let i = 0; i < B; i++) {
    const em = new Float32Array(S);
    for (let s = 0; s < NC; s++) {
      const r = s % 12;
      em[s] = 12 * (cosine(bt[i], templates[s]) + 0.18 * bb[i][r]) + PRIOR[stQ(s)];
    }
    const silent = bE[i] < medE * 0.02;
    let mx = -Infinity;
    for (let s = 0; s < NC; s++) mx = Math.max(mx, em[s]);
    em[NC] = silent ? mx + 3 : mx - 4;
    emis.push(em);
  }
  // Root + major/minor family, used where small quality flips shouldn't count as changes.
  const family = (s: number) => (s === NC ? -1 : (s % 12) + (isMinorish(stQ(s)) ? 12 : 0));

  const viterbi = (penalty: (i: number) => number) => {
    const score = new Float32Array(S);
    const ptr: Uint8Array[] = [];
    for (let s = 0; s < S; s++) score[s] = emis[0]?.[s] ?? 0;
    for (let i = 1; i < B; i++) {
      const p = penalty(i);
      let bestPrev = 0;
      for (let s = 1; s < S; s++) if (score[s] > score[bestPrev]) bestPrev = s;
      const next = new Float32Array(S);
      const pt = new Uint8Array(S);
      for (let s = 0; s < S; s++) {
        const stay = score[s];
        const change = score[bestPrev] - p;
        if (stay >= change) {
          next[s] = stay + emis[i][s];
          pt[s] = s;
        } else {
          next[s] = change + emis[i][s];
          pt[s] = bestPrev;
        }
      }
      ptr.push(pt);
      score.set(next);
    }
    let s = 0;
    for (let k = 1; k < S; k++) if (score[k] > score[s]) s = k;
    const path = new Array<number>(B);
    path[B - 1] = s;
    for (let i = B - 1; i > 0; i--) {
      s = ptr[i - 1][s];
      path[i - 1] = s;
    }
    return path;
  };

  const pass1 = B ? viterbi(() => 7) : [];
  // Downbeat phase: where chord changes and kicks line up best.
  let downbeat = 0;
  {
    const votes = [0, 0, 0, 0];
    for (let i = 1; i < B; i++) if (family(pass1[i]) !== family(pass1[i - 1])) votes[i % 4] += 1;
    const kmed = median(kickAtBeat);
    for (let i = 0; i < B; i++) if (kickAtBeat[i] > kmed) votes[i % 4] += 0.15;
    let best = 0;
    for (let p = 1; p < 4; p++) if (votes[p] > votes[best]) best = p;
    downbeat = best;
  }
  const path = B
    ? viterbi((i) => {
        const pos = (((i - downbeat) % 4) + 4) % 4;
        return pos === 0 ? 3.5 : pos === 2 ? 6 : 10;
      })
    : [];

  const chords: ChordSeg[] = [];
  const segBeats: [number, number][] = [];
  for (let i = 0; i < B; i++) {
    const s = path[i];
    const root = s === NC ? -1 : s % 12;
    const quality: Quality = s === NC ? 'maj' : stQ(s);
    const start = i === 0 ? 0 : beats[i];
    const end = i + 1 < B ? beats[i + 1] : duration;
    const lastSeg = chords[chords.length - 1];
    if (lastSeg && lastSeg.root === root && (root < 0 || lastSeg.quality === quality)) {
      lastSeg.end = end;
      segBeats[segBeats.length - 1][1] = i + 1;
    } else {
      chords.push({ start, end, root, quality });
      segBeats.push([i, i + 1]);
    }
  }
  if (!chords.length) chords.push({ start: 0, end: duration, root: -1, quality: 'maj' });

  // Slash chords: a chord tone other than the root clearly owns the bass.
  if (opts.vocabulary !== 'triads') {
    chords.forEach((c, k) => {
      const [b0, b1] = segBeats[k] ?? [0, 0];
      if (c.root < 0 || b1 - b0 < 2) return;
      const avg = new Array(12).fill(0);
      for (let i = b0; i < b1; i++) for (let p = 0; p < 12; p++) avg[p] += bb[i][p] / (b1 - b0);
      let top = 0;
      for (let p = 1; p < 12; p++) if (avg[p] > avg[top]) top = p;
      const tones = INTERVALS[c.quality].map((d) => (c.root + d) % 12);
      if (top !== c.root && tones.includes(top) && avg[top] > 0.55 && avg[top] > 1.35 * avg[c.root]) c.bass = top;
    });
  }

  // ---------- 7. Key ----------
  progress(0.76, 'Finding the key');
  const g = new Array(12).fill(0);
  for (let i = 0; i < B; i++) for (let k = 0; k < 12; k++) g[k] += bt[i][k] * Math.sqrt(bE[i]);
  const chordTime = new Array(24).fill(0);
  for (const c of chords) if (c.root >= 0 && c.quality !== 'dim' && c.quality !== 'aug') chordTime[c.root + (isMinorish(c.quality) ? 12 : 0)] += c.end - c.start;
  const totalChordTime = chordTime.reduce((a, b) => a + b, 0) || 1;
  const voiced = chords.filter((c) => c.root >= 0);
  let key: Key = { tonic: 0, mode: 'major', confidence: 0 };
  {
    const cands: { k: Key; s: number }[] = [];
    for (let t = 0; t < 12; t++) {
      for (const mode of ['major', 'minor'] as const) {
        const prof = mode === 'major' ? KS_MAJOR : KS_MINOR;
        const rot = Array.from({ length: 12 }, (_, i) => prof[(i - t + 12) % 12]);
        let s = pearson(g, rot);
        const tonicIdx = t + (mode === 'minor' ? 12 : 0);
        s += 0.25 * (chordTime[tonicIdx] / totalChordTime);
        if (voiced.length) {
          const first = voiced[0], lastC = voiced[voiced.length - 1];
          const isTonic = (c: ChordSeg) => c.root === t && isMinorish(c.quality) === (mode === 'minor');
          if (isTonic(first)) s += 0.05;
          if (isTonic(lastC)) s += 0.08;
        }
        cands.push({ k: { tonic: t, mode, confidence: 0 }, s });
      }
    }
    cands.sort((a, b) => b.s - a.s);
    key = { ...cands[0].k, confidence: Math.max(0, Math.min(1, (cands[0].s - cands[1].s) * 4 + 0.5)) };
  }

  // ---------- 8. Sections ----------
  progress(0.82, 'Mapping the song structure');
  const sections: Section[] = [];
  {
    const barStarts: number[] = [];
    for (let i = downbeat; i < B; i += 4) barStarts.push(i);
    const PH = 4; // bars per phrase
    const phrases: { b0: number; b1: number; feat: Float32Array[]; e: number }[] = [];
    for (let p = 0; p < barStarts.length; p += PH) {
      const feats: Float32Array[] = [];
      let e = 0, n = 0;
      for (let q = p; q < Math.min(barStarts.length, p + PH); q++) {
        const c = new Float32Array(12);
        for (let i = barStarts[q]; i < Math.min(B, barStarts[q] + 4); i++) {
          for (let k = 0; k < 12; k++) c[k] += bt[i][k];
          e += bE[i];
          n++;
        }
        feats.push(normL2(c));
      }
      phrases.push({ b0: barStarts[p], b1: Math.min(B, (barStarts[p + PH] ?? B)), feat: feats, e: n ? e / n : 0 });
    }
    const letters: string[] = [];
    let nextLetter = 0;
    for (let p = 0; p < phrases.length; p++) {
      let assigned = '';
      let bestSim = 0;
      for (let q = 0; q < p; q++) {
        const a = phrases[p].feat, b = phrases[q].feat;
        const n = Math.min(a.length, b.length);
        if (!n) continue;
        let s = 0;
        for (let i = 0; i < n; i++) s += cosine(a[i], b[i]);
        s /= n;
        const eRatio = Math.min(phrases[p].e, phrases[q].e) / (Math.max(phrases[p].e, phrases[q].e) || 1);
        s -= eRatio < 0.5 ? 0.06 : 0;
        if (s > 0.9 && s > bestSim) {
          bestSim = s;
          assigned = letters[q];
        }
      }
      if (!assigned) assigned = String.fromCharCode(65 + Math.min(25, nextLetter++));
      letters.push(assigned);
    }
    const medPhraseE = median(phrases.map((p) => p.e));
    for (let p = 0; p < phrases.length; p++) {
      const start = p === 0 ? 0 : beats[phrases[p].b0];
      const end = phrases[p].b1 < B ? beats[phrases[p].b1] : duration;
      const prev = sections[sections.length - 1];
      if (prev && prev.letter === letters[p]) prev.end = end;
      else sections.push({ start, end, letter: letters[p], label: letters[p] });
    }
    if (sections.length > 2) {
      const first = sections[0];
      const lastS = sections[sections.length - 1];
      const isUnique = (l: string) => sections.filter((s) => s.letter === l).length === 1;
      const firstE = phrases[0]?.e ?? 0;
      const lastE = phrases[phrases.length - 1]?.e ?? 0;
      if (isUnique(first.letter) && firstE < medPhraseE * 0.85) first.label = 'Intro';
      if (isUnique(lastS.letter) && lastE < medPhraseE * 0.85) lastS.label = 'Outro';
    }
    if (!sections.length) sections.push({ start: 0, end: duration, letter: 'A', label: 'A' });
    // Relabel letters in order of appearance, skipping Intro/Outro.
    const map = new Map<string, string>();
    let n = 0;
    for (const s of sections) {
      if (s.label === 'Intro' || s.label === 'Outro') continue;
      if (!map.has(s.letter)) map.set(s.letter, String.fromCharCode(65 + Math.min(25, n++)));
      s.letter = map.get(s.letter)!;
      s.label = 'Part ' + s.letter;
    }
  }

  // ---------- 9. Drums ----------
  progress(0.88, 'Transcribing the drums');
  const peaksOf = (sig: Float32Array, k: number) => {
    const flux = new Float32Array(F1);
    for (let i = 1; i < F1; i++) flux[i] = Math.max(0, sig[i] - sig[i - 1]);
    const loc = smooth(flux, Math.round(fps * 1.5));
    const sq = smooth(flux.map((v) => v * v) as Float32Array, Math.round(fps * 1.5));
    const out: number[] = [];
    let lastT = -1;
    for (let i = 2; i < F1 - 2; i++) {
      const v = flux[i];
      if (v < flux[i - 1] || v < flux[i + 1] || v < flux[i - 2] || v < flux[i + 2]) continue;
      const sd = Math.sqrt(Math.max(0, sq[i] - loc[i] * loc[i]));
      if (v < loc[i] + k * sd || v < 0.25) continue;
      const t = (i * H1) / sr;
      if (t - lastT < 0.06) continue;
      out.push(t);
      lastT = t;
    }
    return out;
  };
  const kickHits = peaksOf(kickE, 1.5);
  // A snare has a noisy top end; harmonic strums mostly don't.
  const hatRise = (t: number) => {
    const i = Math.round((t * sr) / H1);
    let m = -9;
    for (let j = i - 1; j <= i + 1; j++) if (j > 0 && j < F1) m = Math.max(m, hatE[j] - hatE[j - 1]);
    return m;
  };
  const snareHits = peaksOf(snareE, 1.4).filter((t) => hatRise(t) > 0.25);
  const hatHits = peaksOf(hatE, 1.3);
  const drumBars: DrumBar[] = [];
  let aligned = 0, totalHits = 0;
  for (let b = downbeat; b + 4 <= B || b < B; b += 4) {
    const t0 = beats[b];
    const t4 = b + 4 < B ? beats[b + 4] : t0 + beatPeriod * 4;
    if (t0 >= duration) break;
    const step = (t4 - t0) / 16;
    const bar: DrumBar = { kick: new Array(16).fill(0), snare: new Array(16).fill(0), hat: new Array(16).fill(0) };
    const place = (hits: number[], arr: number[]) => {
      for (const h of hits) {
        if (h < t0 - step / 2 || h >= t4 - step / 2) continue;
        totalHits++;
        const s = Math.round((h - t0) / step);
        const err = Math.abs(h - (t0 + s * step));
        if (s >= 0 && s < 16 && err < step * 0.45) {
          arr[s] = 1;
          aligned++;
        }
      }
    };
    place(kickHits, bar.kick);
    place(snareHits, bar.snare);
    place(hatHits, bar.hat);
    drumBars.push(bar);
    if (b + 4 >= B) break;
  }
  const drumConfidence = totalHits ? aligned / totalHits : 0;

  // ---------- 10. Waveform peaks ----------
  progress(0.95, 'Drawing the waveform');
  const P = Math.min(1600, Math.max(200, Math.round(duration * 6)));
  const peaks: number[] = [];
  const win = Math.max(1, Math.floor(x.length / P));
  let pmax = 0;
  for (let p = 0; p < P; p++) {
    let s = 0;
    const a = p * win;
    for (let i = a; i < Math.min(x.length, a + win); i += 4) s += x[i] * x[i];
    const v = Math.sqrt(s / (win / 4));
    peaks.push(v);
    if (v > pmax) pmax = v;
  }
  for (let p = 0; p < P; p++) peaks[p] = Math.round((peaks[p] / (pmax || 1)) * 1000) / 1000;

  progress(1, 'Done');
  return {
    version: 2,
    source: opts.harmonic ? 'stems' : 'mix',
    duration,
    tuningCents,
    bpm: Math.round(bpm * 10) / 10,
    beats: beats.map((b) => Math.round(b * 1000) / 1000),
    downbeat,
    chords,
    key,
    sections,
    drums: { bars: drumBars, confidence: Math.round(drumConfidence * 100) / 100 },
    peaks,
  };
}
