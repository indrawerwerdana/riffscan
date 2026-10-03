// Generates a synthetic test song (chords + bass + drums) for testing the analyser.

export interface SynthSpec {
  sr: number;
  bpm: number;
  bars: string[]; // chord per bar, e.g. "Em"
  tuningCents?: number;
  parts?: { chords?: boolean; bass?: boolean; drums?: boolean };
  normalize?: number; // fixed gain instead of peak-normalising
}

const NAMES: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

const IV: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8] };

export function parseChord(s: string) {
  const m = /^([A-G][#b]?)(maj7|m7|sus2|sus4|dim|aug|7|m)?(?:\/([A-G][#b]?))?$/.exec(s)!;
  const root = NAMES[m[1]];
  const q = m[2] ?? '';
  return { root, minor: q === 'm', iv: IV[q], bass: m[3] ? NAMES[m[3]] : root };
}

export function synthSong(spec: SynthSpec): Float32Array {
  const { sr, bpm, bars } = spec;
  const beat = 60 / bpm;
  const dur = bars.length * 4 * beat + 1;
  const out = new Float32Array(Math.ceil(dur * sr));
  const tune = Math.pow(2, (spec.tuningCents ?? 0) / 1200);
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12) * tune;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  const tone = (t0: number, len: number, f: number, amp: number, harmonics = 5, decay = 1.2) => {
    const s0 = Math.floor(t0 * sr), n = Math.floor(len * sr);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.01) * Math.exp(-t * decay) * Math.min(1, (len - t) / 0.03);
      let v = 0;
      for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * h * 0.7 + 0.3);
      out[s0 + i] += amp * env * v;
    }
  };
  const kick = (t0: number) => {
    const s0 = Math.floor(t0 * sr);
    for (let i = 0; i < 0.25 * sr && s0 + i < out.length; i++) {
      const t = i / sr;
      const f = 50 + 90 * Math.exp(-t * 30);
      out[s0 + i] += 0.6 * Math.exp(-t * 12) * Math.sin(2 * Math.PI * f * t);
    }
  };
  const snare = (t0: number) => {
    const s0 = Math.floor(t0 * sr);
    for (let i = 0; i < 0.18 * sr && s0 + i < out.length; i++) {
      const t = i / sr;
      out[s0 + i] += 0.25 * Math.exp(-t * 22) * (rnd() * 0.8 + 0.4 * Math.sin(2 * Math.PI * 190 * t));
    }
  };
  const hat = (t0: number) => {
    const s0 = Math.floor(t0 * sr);
    let prev = 0;
    for (let i = 0; i < 0.05 * sr && s0 + i < out.length; i++) {
      const t = i / sr;
      const n = rnd();
      const hp = n - prev; // crude high-pass
      prev = n;
      out[s0 + i] += 0.08 * Math.exp(-t * 80) * hp;
    }
  };

  bars.forEach((name, b) => {
    const { root, iv, bass } = parseChord(name);
    const t0 = b * 4 * beat;
    const intro = b < 2;
    // Chord tones around C4..C5, strummed every 2 beats.
    const notes = iv.map((d) => 48 + root + d).map((m) => (m > 64 ? m - 12 : m));
    const P = spec.parts ?? { chords: true, bass: true, drums: true };
    if (P.chords) for (const half of [0, 2]) {
      notes.forEach((m, i) => tone(t0 + half * beat + i * 0.015, 2 * beat, hz(m + 12), 0.12, 6, 0.8));
    }
    if (!intro) {
      if (P.bass) for (let q = 0; q < 4; q++) tone(t0 + q * beat, beat * 0.9, hz(36 + bass), 0.22, 3, 2);
      if (P.drums) {
        kick(t0);
        kick(t0 + 2 * beat);
        snare(t0 + beat);
        snare(t0 + 3 * beat);
        for (let e = 0; e < 8; e++) hat(t0 + (e * beat) / 2);
      }
    }
  });
  if (spec.normalize) {
    for (let i = 0; i < out.length; i++) out[i] *= spec.normalize;
    return out;
  }
  let mx = 0;
  for (let i = 0; i < out.length; i++) mx = Math.max(mx, Math.abs(out[i]));
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / mx) * 0.9;
  return out;
}

export function toWav(x: Float32Array, sr: number): Uint8Array {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  return new Uint8Array(buf);
}
