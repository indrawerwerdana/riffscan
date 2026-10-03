// Derived structures: bars, chord-per-bar grid, tabs and the chord+lyrics sheet.
import type { Analysis, Bar, ChordSeg, LyricWord, Lyrics, NoteEvent } from '../types';
import { chordLabel, simplifyChord, type Chord } from './theory';

/** Map chords to plain triads and merge neighbours that become identical. */
export function simplifyChords(chords: ChordSeg[]): ChordSeg[] {
  const out: ChordSeg[] = [];
  for (const c of chords) {
    const s = c.root < 0 ? { ...c } : simplifyChord(c);
    const prev = out[out.length - 1];
    if (prev && prev.root === s.root && prev.quality === s.quality) prev.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

export function getBars(a: Analysis): Bar[] {
  const bars: Bar[] = [];
  const { beats, downbeat } = a;
  const period = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  if (downbeat > 0) bars.push({ index: -1, start: 0, end: beats[downbeat], beatStart: 0, beatCount: downbeat });
  let n = 0;
  for (let i = downbeat; i < beats.length; i += 4) {
    const start = n === 0 && downbeat === 0 ? 0 : beats[i];
    const end = i + 4 < beats.length ? beats[i + 4] : Math.min(a.duration, beats[i] + period * 4);
    bars.push({ index: n++, start, end, beatStart: i, beatCount: Math.min(4, beats.length - i) });
  }
  return bars;
}

export function chordAt(a: Analysis, t: number): number {
  const c = a.chords;
  let lo = 0, hi = c.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function indexAt(times: number[], t: number): number {
  let lo = 0, hi = times.length - 1;
  if (!times.length || t < times[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Chords sounding in each bar, e.g. [["Em"], ["C","G"]]. */
export function chordGrid(a: Analysis, bars: Bar[]): ChordSeg[][] {
  return bars.map((b) => {
    const list: ChordSeg[] = [];
    for (const c of a.chords) {
      if (c.end <= b.start + 0.05 || c.start >= b.end - 0.05) continue;
      const prev = list[list.length - 1];
      if (prev && prev.root === c.root && prev.quality === c.quality && (prev.bass ?? -1) === (c.bass ?? -1)) continue;
      list.push(c);
    }
    return list.length ? list : [{ start: b.start, end: b.end, root: -1, quality: 'maj' }];
  });
}

// ---------- Tabs ----------
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];
export const BASS_TUNING = [28, 33, 38, 43];

export interface TabNote {
  step: number; // 0..15 within the bar
  string: number; // 0 = lowest string
  fret: number;
}

/**
 * Map transcribed notes to fret positions for one instrument.
 * Greedy, keeping the hand near its previous position.
 */
export function buildTab(notes: NoteEvent[], bars: Bar[], tuning: number[], range: [number, number], maxPoly: number, minAmp: number): TabNote[][] {
  const out: TabNote[][] = bars.map(() => []);
  let hand = 3;
  const inRange = notes.filter((n) => n.p >= range[0] && n.p <= range[1] && n.a >= minAmp);
  let bi = 0;
  // Group notes into chords by onset.
  const groups: NoteEvent[][] = [];
  for (const n of inRange) {
    const g = groups[groups.length - 1];
    if (g && n.t - g[0].t < 0.035) g.push(n);
    else groups.push([n]);
  }
  for (const g of groups) {
    while (bi < bars.length - 1 && g[0].t >= bars[bi].end) bi++;
    const bar = bars[bi];
    if (!bar || g[0].t < bar.start - 0.05) continue;
    const step = Math.max(0, Math.min(15, Math.round(((g[0].t - bar.start) / (bar.end - bar.start)) * 16)));
    const pick = [...g].sort((a, b) => b.a - a.a).slice(0, maxPoly).sort((a, b) => a.p - b.p);
    const used = new Set<number>();
    const placed: TabNote[] = [];
    for (const n of pick) {
      let best: TabNote | null = null;
      let bestCost = Infinity;
      for (let s = 0; s < tuning.length; s++) {
        if (used.has(s)) continue;
        const f = n.p - tuning[s];
        if (f < 0 || f > 15) continue;
        const cost = (f === 0 ? 0.3 : Math.abs(f - hand)) + f * 0.35;
        if (cost < bestCost) {
          bestCost = cost;
          best = { step, string: s, fret: f };
        }
      }
      if (best) {
        used.add(best.string);
        placed.push(best);
      }
    }
    const fretted = placed.filter((p) => p.fret > 0);
    if (fretted.length) hand = Math.min(9, fretted.reduce((s, p) => s + p.fret, 0) / fretted.length);
    // Avoid two notes on one string at the same step.
    for (const p of placed) {
      if (!out[bi].some((q) => q.step === p.step && q.string === p.string)) out[bi].push(p);
    }
  }
  return out;
}

export function bassLine(notes: NoteEvent[]): NoteEvent[] {
  // Keep the lowest note of each onset group (bass is usually the lowest voice).
  const low = notes.filter((n) => n.p >= 28 && n.p <= 55);
  const out: NoteEvent[] = [];
  for (const n of low) {
    const prev = out[out.length - 1];
    if (prev && n.t - prev.t < 0.06) {
      if (n.p < prev.p) out[out.length - 1] = n;
    } else out.push(n);
  }
  return out;
}

/** Render one bar of tab as text lines (high string first). */
export function tabText(bar: TabNote[], strings: string[]): string[] {
  const cols = 16;
  const lines = strings.map(() => new Array(cols).fill('--'));
  for (const n of bar) {
    const row = strings.length - 1 - n.string;
    const t = String(n.fret);
    lines[row][n.step] = t.length === 1 ? t + '-' : t;
  }
  return lines.map((l) => l.join('-'));
}

// ---------- Chords + lyrics sheet ----------
export interface SheetToken {
  text: string;
  start: number;
  end: number;
  chord?: string;
  chordStart?: number;
}
export interface SheetLine {
  kind: 'lyric' | 'instrumental';
  start: number;
  end: number;
  section?: string;
  tokens: SheetToken[];
}

export function buildSheet(a: Analysis, lyrics: Lyrics, transpose: number, flats: boolean): SheetLine[] {
  const segs = lyrics.segments.length ? lyrics.segments : [];
  const words = lyrics.words;
  const lines: SheetLine[] = [];
  // Assign words to segments.
  const segWords: LyricWord[][] = segs.map(() => []);
  let si = 0;
  for (const w of words) {
    while (si < segs.length - 1 && w.start >= segs[si].end - 0.02 && w.start >= segs[si + 1].start - 0.3) si++;
    if (segs.length) segWords[si].push(w);
  }
  const chordsIn = (t0: number, t1: number) => a.chords.filter((c) => c.start < t1 && c.end > t0 && c.root >= 0);
  const label = (c: Chord) => chordLabel(c, transpose, flats);
  let cursor = 0;
  const sectionAt = (t: number) => a.sections.find((s) => t >= s.start && t < s.end)?.label;
  let lastSection = '';
  const pushInstrumental = (t0: number, t1: number) => {
    if (t1 - t0 < 1.5) return;
    const cs = chordsIn(t0, t1);
    if (!cs.length) return;
    const sec = sectionAt(t0 + 0.01);
    lines.push({
      kind: 'instrumental',
      start: t0,
      end: t1,
      section: sec !== lastSection ? sec : undefined,
      tokens: cs.map((c) => ({ text: '', start: Math.max(t0, c.start), end: Math.min(t1, c.end), chord: label(c), chordStart: c.start })),
    });
    if (sec) lastSection = sec;
  };
  segs.forEach((g, i) => {
    const ws = segWords[i];
    if (!ws.length) return;
    const start = Math.min(g.start, ws[0].start);
    const end = Math.max(g.end, ws[ws.length - 1].end);
    pushInstrumental(cursor, start);
    const tokens: SheetToken[] = ws.map((w) => ({ text: w.text, start: w.start, end: w.end }));
    // Place each chord change on the word it falls in (or the next word).
    const cs = chordsIn(start - 0.25, end);
    let lastLabel = '';
    for (const c of cs) {
      const t = Math.max(c.start, start - 0.25);
      let idx = tokens.findIndex((tk) => tk.end > t + 0.05);
      if (idx < 0) idx = tokens.length - 1;
      const l = label(c);
      if (l === lastLabel) continue;
      if (!tokens[idx].chord) {
        tokens[idx].chord = l;
        tokens[idx].chordStart = c.start;
      }
      lastLabel = l;
    }
    if (!tokens[0].chord) {
      const c = a.chords.find((x) => x.start <= tokens[0].start + 0.01 && x.end > tokens[0].start);
      if (c && c.root >= 0) {
        tokens[0].chord = label(c);
        tokens[0].chordStart = c.start;
      }
    }
    const sec = sectionAt(start + 0.01);
    lines.push({ kind: 'lyric', start, end, section: sec !== lastSection ? sec : undefined, tokens });
    if (sec) lastSection = sec;
    cursor = end;
  });
  pushInstrumental(cursor, a.duration);
  return lines;
}

export function sheetToText(title: string, keyText: string, lines: SheetLine[]): string {
  const out: string[] = [title, keyText, ''];
  for (const l of lines) {
    if (l.section) out.push(`[${l.section}]`);
    if (l.kind === 'instrumental') {
      out.push('| ' + l.tokens.map((t) => t.chord).join(' | ') + ' |');
      continue;
    }
    let chordLine = '';
    let textLine = '';
    for (const t of l.tokens) {
      if (t.chord) {
        if (chordLine.length > textLine.length) textLine = textLine.padEnd(chordLine.length + 1);
        chordLine = chordLine.padEnd(textLine.length) + t.chord + ' ';
      }
      textLine += t.text + ' ';
    }
    out.push(chordLine.trimEnd());
    out.push(textLine.trimEnd());
    out.push('');
  }
  return out.join('\n');
}
