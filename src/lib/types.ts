import type { Key, Quality } from './music/theory';

export interface ChordSeg {
  start: number;
  end: number;
  root: number; // -1 = no chord
  quality: Quality;
  bass?: number; // slash bass pitch class
}

export interface Section {
  start: number;
  end: number;
  label: string; // "Intro", "A", "B", "Outro"…
  letter: string;
}

export interface DrumBar {
  kick: number[]; // 16 steps, 0/1
  snare: number[];
  hat: number[];
}

export interface Analysis {
  version: 1 | 2;
  /** Which audio the harmony/drums were read from. */
  source?: 'mix' | 'stems';
  duration: number;
  tuningCents: number;
  bpm: number;
  beats: number[];
  downbeat: number; // index of the first downbeat in `beats`
  chords: ChordSeg[];
  key: Key;
  sections: Section[];
  drums: { bars: DrumBar[]; confidence: number };
  peaks: number[];
}

export interface NoteEvent {
  t: number; // start, seconds
  d: number; // duration, seconds
  p: number; // midi pitch
  a: number; // amplitude 0..1
}

export interface LyricWord {
  text: string;
  start: number;
  end: number;
}

export interface Lyrics {
  engine: 'groq' | 'browser';
  model: string;
  language?: string;
  words: LyricWord[];
  segments: { start: number; end: number; text: string }[];
}

export type SourceType = 'file' | 'link' | 'mic' | 'tab';

export type StemName = 'drums' | 'bass' | 'other' | 'vocals';
export const STEM_NAMES: StemName[] = ['vocals', 'drums', 'bass', 'other'];

export interface StemInfo {
  model: 'htdemucs';
  createdAt: number;
  seconds: number;
  webgpu: boolean;
  peaks: Record<StemName, number[]>;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  createdAt: number;
  source: { type: SourceType; url?: string; platform?: string; fileName?: string };
  duration: number;
  analysis: Analysis;
  notes?: NoteEvent[];
  /** Notes transcribed from separated stems (cleaner tabs). */
  stemNotes?: { other?: NoteEvent[]; bass?: NoteEvent[] };
  lyrics?: Lyrics & { fromVocals?: boolean };
  stems?: StemInfo;
}

export interface Bar {
  index: number; // 0-based bar number (pickup bar = -1)
  start: number;
  end: number;
  beatStart: number; // index into beats
  beatCount: number;
}
