// Chord shapes for guitar and ukulele.
// Common shapes come from a hand-checked table; everything else (7ths, sus, dim, aug,
// slash chords, any root) is found by searching the fretboard for a playable voicing.
import { INTERVALS, mod12, type Chord, type Quality } from './theory';

export interface Shape {
  frets: number[]; // per string, low → high; -1 = muted, 0 = open
  barre?: number; // fret of a barre
  baseFret: number; // first fret shown in the diagram
}

const GUITAR = [40, 45, 50, 55, 59, 64];
const UKE = [67, 60, 64, 69]; // re-entrant G C E A

const key = (root: number, q: Quality, bass?: number) => `${root}:${q}${bass != null && bass !== root ? '/' + bass : ''}`;

// Hand-checked open shapes (guitar). Keys: root pitch class : quality [/ bass].
const OPEN_GUITAR: Record<string, number[]> = {
  [key(0, 'maj')]: [-1, 3, 2, 0, 1, 0], // C
  [key(2, 'maj')]: [-1, -1, 0, 2, 3, 2], // D
  [key(4, 'maj')]: [0, 2, 2, 1, 0, 0], // E
  [key(7, 'maj')]: [3, 2, 0, 0, 0, 3], // G
  [key(9, 'maj')]: [-1, 0, 2, 2, 2, 0], // A
  [key(2, 'min')]: [-1, -1, 0, 2, 3, 1], // Dm
  [key(4, 'min')]: [0, 2, 2, 0, 0, 0], // Em
  [key(9, 'min')]: [-1, 0, 2, 2, 1, 0], // Am
  [key(9, '7')]: [-1, 0, 2, 0, 2, 0], // A7
  [key(11, '7')]: [-1, 2, 1, 2, 0, 2], // B7
  [key(0, '7')]: [-1, 3, 2, 3, 1, 0], // C7
  [key(2, '7')]: [-1, -1, 0, 2, 1, 2], // D7
  [key(4, '7')]: [0, 2, 0, 1, 0, 0], // E7
  [key(7, '7')]: [3, 2, 0, 0, 0, 1], // G7
  [key(9, 'm7')]: [-1, 0, 2, 0, 1, 0], // Am7
  [key(2, 'm7')]: [-1, -1, 0, 2, 1, 1], // Dm7
  [key(4, 'm7')]: [0, 2, 0, 0, 0, 0], // Em7
  [key(0, 'maj7')]: [-1, 3, 2, 0, 0, 0], // Cmaj7
  [key(2, 'maj7')]: [-1, -1, 0, 2, 2, 2], // Dmaj7
  [key(5, 'maj7')]: [-1, -1, 3, 2, 1, 0], // Fmaj7
  [key(7, 'maj7')]: [3, 2, 0, 0, 0, 2], // Gmaj7
  [key(9, 'maj7')]: [-1, 0, 2, 1, 2, 0], // Amaj7
  [key(4, 'maj7')]: [0, 2, 1, 1, 0, 0], // Emaj7
  [key(9, 'sus2')]: [-1, 0, 2, 2, 0, 0], // Asus2
  [key(9, 'sus4')]: [-1, 0, 2, 2, 3, 0], // Asus4
  [key(2, 'sus2')]: [-1, -1, 0, 2, 3, 0], // Dsus2
  [key(2, 'sus4')]: [-1, -1, 0, 2, 3, 3], // Dsus4
  [key(4, 'sus4')]: [0, 2, 2, 2, 0, 0], // Esus4
  [key(7, 'sus4')]: [3, 3, 0, 0, 1, 3], // Gsus4
  [key(2, 'maj', 6)]: [2, -1, 0, 2, 3, 2], // D/F#
  [key(7, 'maj', 11)]: [-1, 2, 0, 0, 0, 3], // G/B
  [key(0, 'maj', 7)]: [3, 3, 2, 0, 1, 0], // C/G
  [key(0, 'maj', 4)]: [0, 3, 2, 0, 1, 0], // C/E
  [key(9, 'maj', 1)]: [-1, 4, 2, 2, 2, 0], // A/C#
  [key(2, 'maj', 9)]: [-1, 0, 0, 2, 3, 2], // D/A
};

const OPEN_UKE: Record<string, number[]> = {
  [key(9, '7')]: [0, 1, 0, 0], [key(11, '7')]: [2, 3, 2, 2], [key(0, '7')]: [0, 0, 0, 1], [key(2, '7')]: [2, 2, 2, 3],
  [key(4, '7')]: [1, 2, 0, 2], [key(7, '7')]: [0, 2, 1, 2], [key(9, 'm7')]: [0, 0, 0, 0], [key(2, 'm7')]: [2, 2, 1, 3],
  [key(4, 'm7')]: [0, 2, 0, 2], [key(0, 'maj7')]: [0, 0, 0, 2], [key(5, 'maj7')]: [2, 4, 1, 3], [key(7, 'maj7')]: [0, 2, 2, 2],
  [key(9, 'sus4')]: [2, 2, 0, 0], [key(2, 'sus4')]: [0, 2, 3, 0], [key(9, 'sus2')]: [2, 4, 5, 2], [key(2, 'sus2')]: [2, 2, 0, 0],
};

// Uke major/minor shapes (one comfortable shape per chord).
const UKE_TRIADS: Record<string, number[]> = {
  '0:maj': [0, 0, 0, 3], '1:maj': [1, 1, 1, 4], '2:maj': [2, 2, 2, 0], '3:maj': [0, 3, 3, 1],
  '4:maj': [4, 4, 4, 2], '5:maj': [2, 0, 1, 0], '6:maj': [3, 1, 2, 1], '7:maj': [0, 2, 3, 2],
  '8:maj': [5, 3, 4, 3], '9:maj': [2, 1, 0, 0], '10:maj': [3, 2, 1, 1], '11:maj': [4, 3, 2, 2],
  '0:min': [0, 3, 3, 3], '1:min': [1, 1, 0, 4], '2:min': [2, 2, 1, 0], '3:min': [3, 3, 2, 1],
  '4:min': [0, 4, 3, 2], '5:min': [1, 0, 1, 3], '6:min': [2, 1, 2, 0], '7:min': [0, 2, 3, 1],
  '8:min': [1, 3, 4, 2], '9:min': [2, 0, 0, 0], '10:min': [3, 1, 1, 1], '11:min': [4, 2, 2, 2],
};

function finish(frets: number[]): Shape {
  const fretted = frets.filter((f) => f > 0);
  const min = fretted.length ? Math.min(...fretted) : 1;
  const max = fretted.length ? Math.max(...fretted) : 1;
  const baseFret = max > 4 ? min : 1;
  // Barre: the lowest fret is used on 2+ strings and no open string sits between them.
  let barre: number | undefined;
  const at = frets.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0);
  const hasOpen = frets.some((f) => f === 0);
  if (min > 0 && at.length >= 2) {
    const first = at[0], last = at[at.length - 1];
    const between = frets.slice(first, last + 1);
    if (between.every((f) => f >= min) && (fretted.length >= 5 || (at.length >= 3 && !hasOpen))) barre = min;
  }
  return { frets, baseFret, barre };
}

/** Classic E- and A-shape barre chords for major/minor. */
function barreTriad(root: number, quality: 'maj' | 'min'): number[] {
  const e = mod12(root - 4) || 12;
  const a = mod12(root - 9) || 12;
  if (e <= a || a > 9) {
    const f = e;
    return quality === 'maj' ? [f, f + 2, f + 2, f + 1, f, f] : [f, f + 2, f + 2, f, f, f];
  }
  const f = a;
  return quality === 'maj' ? [-1, f, f + 2, f + 2, f + 2, f] : [-1, f, f + 2, f + 2, f + 1, f];
}

/**
 * Search the fretboard for the most playable voicing of a chord.
 * `bassPc`: required lowest note (guitar only). Returns null if nothing fits.
 */
export function searchVoicing(pcs: number[], rootPc: number, bassPc: number | null, tuning: number[], reentrant: boolean): number[] | null {
  const required = new Set(pcs);
  const allowed = new Set(pcs);
  if (bassPc != null) allowed.add(bassPc);
  const fifth = mod12(rootPc + 7);
  let best: number[] | null = null;
  let bestScore = -Infinity;
  const n = tuning.length;
  for (let base = 1; base <= 10; base++) {
    const window = [base, base + 1, base + 2, base + 3];
    const opts: number[][] = tuning.map((open) => {
      const o: number[] = reentrant ? [] : [-1];
      if (base <= 3 && allowed.has(mod12(open))) o.push(0);
      for (const f of window) if (allowed.has(mod12(open + f))) o.push(f);
      return o;
    });
    const cur = new Array(n).fill(-1);
    const rec = (s: number) => {
      if (s === n) {
        const sounding = cur.map((f, i) => (f >= 0 ? tuning[i] + f : -1));
        const playedIdx = sounding.map((p, i) => (p >= 0 ? i : -1)).filter((i) => i >= 0);
        if (playedIdx.length < (reentrant ? 4 : 4)) return;
        if (!reentrant) {
          // No muted strings between sounding strings.
          for (let i = playedIdx[0]; i <= playedIdx[playedIdx.length - 1]; i++) if (cur[i] < 0) return;
          const low = mod12(sounding[playedIdx[0]]);
          if (bassPc != null ? low !== bassPc : low !== rootPc) return;
        }
        const have = new Set(playedIdx.map((i) => mod12(sounding[i])));
        for (const p of required) if (!have.has(p) && p !== fifth) return;
        // The extra slash-bass note may only be the lowest note.
        if (bassPc != null && !required.has(bassPc) && playedIdx.slice(1).some((i) => mod12(sounding[i]) === bassPc)) return;
        const fretted = cur.filter((f) => f > 0);
        const minF = fretted.length ? Math.min(...fretted) : 0;
        const atMin = cur.filter((f) => f === minF && f > 0).length;
        const fingers = atMin >= 2 ? fretted.length - atMin + 1 : fretted.length;
        if (fingers > 4) return;
        const maxF = fretted.length ? Math.max(...fretted) : 0;
        if (maxF - minF > 3) return;
        const opens = cur.filter((f) => f === 0).length;
        if (opens > 0 && maxF > 4) return; // open strings with a high-position shape are awkward
        let score = playedIdx.length * 1.0 + opens * 0.7 - minF * 0.45 - fingers * 0.35 - (atMin >= 2 && fretted.length > 3 ? 1.2 : 0);
        if (!have.has(fifth) && required.has(fifth)) score -= 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = [...cur];
        }
        return;
      }
      for (const f of opts[s]) {
        cur[s] = f;
        rec(s + 1);
      }
      cur[s] = -1;
    };
    rec(0);
  }
  return best;
}

const cache = new Map<string, Shape | null>();

export function guitarShape(input: Chord): Shape | null {
  if (input.root < 0) return null;
  const root = mod12(input.root);
  const bass = input.bass != null ? mod12(input.bass) : undefined;
  const k = 'g' + key(root, input.quality, bass);
  if (cache.has(k)) return cache.get(k)!;
  let frets = OPEN_GUITAR[key(root, input.quality, bass)];
  if (!frets && bass == null && (input.quality === 'maj' || input.quality === 'min')) frets = barreTriad(root, input.quality);
  const pcs = INTERVALS[input.quality].map((d) => mod12(root + d));
  if (!frets) frets = searchVoicing(pcs, root, bass ?? null, GUITAR, false) ?? undefined!;
  // Slash chord with no playable voicing: fall back to the plain chord.
  if (!frets && bass != null) {
    const plain = guitarShape({ root, quality: input.quality });
    cache.set(k, plain);
    return plain;
  }
  const shape = frets ? finish(frets) : null;
  cache.set(k, shape);
  return shape;
}

export function ukeShape(input: Chord): Shape | null {
  if (input.root < 0) return null;
  const root = mod12(input.root);
  const k = 'u' + key(root, input.quality);
  if (cache.has(k)) return cache.get(k)!;
  let frets = OPEN_UKE[key(root, input.quality)] ?? UKE_TRIADS[`${root}:${input.quality}`];
  if (!frets) frets = searchVoicing(INTERVALS[input.quality].map((d) => mod12(root + d)), root, null, UKE, true) ?? undefined!;
  const shape = frets ? finish(frets) : null;
  cache.set(k, shape);
  return shape;
}

/** Rough difficulty used to flag hard chords (barre or high position). */
export function isHardOnGuitar(c: Chord) {
  const s = guitarShape(c);
  return !!s?.barre || (s?.baseFret ?? 1) > 1;
}
