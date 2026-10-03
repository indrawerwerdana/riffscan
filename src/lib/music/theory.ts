// Music theory helpers: note names, chords, keys, transposition, capo suggestions.

export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export type Quality = 'maj' | 'min' | '7' | 'maj7' | 'm7' | 'sus2' | 'sus4' | 'dim' | 'aug';
export interface Chord {
  root: number; // pitch class 0-11, or -1 for "no chord"
  quality: Quality;
  bass?: number; // slash-chord bass pitch class (when different from the root)
}

export const QUALITIES: Quality[] = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug'];
export const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};
const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', '7': '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', dim: 'dim', aug: 'aug' };
export const isMinorish = (q: Quality) => q === 'min' || q === 'm7' || q === 'dim';

/** Reduce any chord to a plain major/minor triad without a slash bass. */
export function simplifyChord<T extends Chord>(c: T): T {
  const q: Quality = isMinorish(c.quality) ? 'min' : 'maj';
  const { bass: _b, ...rest } = c;
  return { ...(rest as T), quality: q };
}
export interface Key {
  tonic: number;
  mode: 'major' | 'minor';
  confidence: number;
}

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Keys that are conventionally written with flats. */
export function prefersFlats(key?: Key | null): boolean {
  if (!key) return false;
  const majorTonic = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3);
  return [5, 10, 3, 8, 1, 6].includes(majorTonic); // F Bb Eb Ab Db Gb
}

export function noteName(pc: number, flats = false): string {
  return (flats ? FLATS : SHARPS)[mod12(pc)];
}

export function chordLabel(c: Chord | null | undefined, transpose = 0, flats = false): string {
  if (!c || c.root < 0) return 'N.C.';
  const base = noteName(c.root + transpose, flats) + (SUFFIX[c.quality] ?? '');
  if (c.bass != null && c.bass >= 0 && mod12(c.bass) !== mod12(c.root)) return base + '/' + noteName(c.bass + transpose, flats);
  return base;
}

export function keyLabel(k: Key | null | undefined, transpose = 0): string {
  if (!k) return '—';
  const shifted: Key = { ...k, tonic: mod12(k.tonic + transpose) };
  return noteName(shifted.tonic, prefersFlats(shifted)) + (k.mode === 'minor' ? ' minor' : ' major');
}

export function chordPcs(c: Chord): number[] {
  if (c.root < 0) return [];
  const pcs = (INTERVALS[c.quality] ?? INTERVALS.maj).map((i) => mod12(c.root + i));
  if (c.bass != null && c.bass >= 0 && !pcs.includes(mod12(c.bass))) pcs.unshift(mod12(c.bass));
  return pcs;
}

export function sameChord(a: Chord | null, b: Chord | null) {
  if (!a || !b) return a === b;
  return a.root === b.root && (a.root < 0 || (a.quality === b.quality && (a.bass ?? -1) === (b.bass ?? -1)));
}

/** Open-position chords that beginners can play without a barre. */
const EASY = new Set([
  'C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm',
  'A7', 'B7', 'C7', 'D7', 'E7', 'G7', 'Am7', 'Dm7', 'Em7',
  'Cmaj7', 'Dmaj7', 'Fmaj7', 'Gmaj7', 'Amaj7', 'Emaj7',
  'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4',
]);

export interface CapoSuggestion {
  capo: number;
  shapesKey: string; // e.g. "G shapes"
  easyShare: number; // 0..1 of song time playable with open shapes
}

/**
 * Find the capo position (0-7) where the most song time can be played
 * with easy open chord shapes.
 */
export function suggestCapo(
  segments: { chord: Chord; start: number; end: number }[],
  key: Key | null,
  transpose = 0,
): CapoSuggestion {
  let best: CapoSuggestion = { capo: 0, shapesKey: '', easyShare: -1 };
  const total = segments.reduce((s, x) => s + (x.chord.root >= 0 ? x.end - x.start : 0), 0) || 1;
  for (let capo = 0; capo <= 7; capo++) {
    let easy = 0;
    for (const s of segments) {
      if (s.chord.root < 0) continue;
      const shape = chordLabel({ root: s.chord.root, quality: s.chord.quality }, transpose - capo);
      if (EASY.has(shape)) easy += s.end - s.start;
    }
    const share = easy / total;
    // Small bias towards lower capo positions.
    if (share > best.easyShare + 0.04 || (capo === 0 && best.easyShare < 0)) {
      best = { capo, shapesKey: '', easyShare: share };
    }
  }
  if (key) {
    const shapeTonic = mod12(key.tonic + transpose - best.capo);
    best.shapesKey = noteName(shapeTonic) + (key.mode === 'minor' ? 'm' : '') + ' shapes';
  }
  return best;
}

/** Notes of the pentatonic scale for soloing over a key. */
export function pentatonic(key: Key, transpose = 0): string[] {
  const t = mod12(key.tonic + transpose);
  const iv = key.mode === 'minor' ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const flats = prefersFlats({ ...key, tonic: t });
  return iv.map((i) => noteName(t + i, flats));
}

/** Diatonic chords of a key (triads), used for the coach and quick tips. */
export function diatonicChords(key: Key, transpose = 0): string[] {
  const t = mod12(key.tonic + transpose);
  const flats = prefersFlats({ ...key, tonic: t });
  const major: [number, Quality][] = [[0, 'maj'], [2, 'min'], [4, 'min'], [5, 'maj'], [7, 'maj'], [9, 'min']];
  const minor: [number, Quality][] = [[0, 'min'], [3, 'maj'], [5, 'min'], [7, 'min'], [8, 'maj'], [10, 'maj']];
  return (key.mode === 'major' ? major : minor).map(([i, q]) => chordLabel({ root: t + i, quality: q }, 0, flats));
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function midiToName(midi: number, flats = false): string {
  return noteName(midi, flats) + (Math.floor(midi / 12) - 1);
}
