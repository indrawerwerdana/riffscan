// Background AI jobs per song: stem separation, note transcription (tabs) and lyrics.
import { useSyncExternalStore } from 'react';
import { decodeBlob, runAnalysis, toMono } from './audio/decode';
import { getAudio, getSong, getStems, patchSong, saveStems } from './store/library';
import { getSettings } from './store/settings';
import type { StemName } from './types';

export type JobState = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'skipped';
export interface Job {
  state: JobState;
  progress: number | null;
  label: string;
  error?: string;
  eta?: number | null;
}
export interface SongJobs {
  stems: Job;
  notes: Job;
  lyrics: Job;
}
type Kind = keyof SongJobs;

const idle = (): Job => ({ state: 'idle', progress: null, label: '' });
const fresh = (): SongJobs => ({ stems: idle(), notes: idle(), lyrics: idle() });
const jobs = new Map<string, SongJobs>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
let queue: Promise<void> = Promise.resolve();
const enqueue = (fn: () => Promise<void>) => (queue = queue.then(fn, fn));

function set(id: string, kind: Kind, patch: Partial<Job>) {
  const cur = jobs.get(id) ?? fresh();
  jobs.set(id, { ...cur, [kind]: { ...cur[kind], ...patch } });
  emit();
}

export function getJobs(id: string): SongJobs {
  return jobs.get(id) ?? fresh();
}

export function useJobs(id: string): SongJobs {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  return getJobs(id);
}

const busy = (j: Job) => j.state === 'running' || j.state === 'queued';

async function mixSamples(id: string, sr: number) {
  const blob = await getAudio(id);
  if (!blob) throw new Error('Audio not found');
  return toMono(await decodeBlob(blob), sr);
}

async function stemSamples(id: string, names: StemName[], sr: number): Promise<Float32Array | null> {
  const stems = await getStems(id);
  if (!stems) return null;
  let sum: Float32Array | null = null;
  for (const n of names) {
    const x = await toMono(await decodeBlob(stems[n]), sr);
    if (!sum) sum = x;
    else for (let i = 0; i < Math.min(sum.length, x.length); i++) sum[i] += x[i];
  }
  return sum;
}

// ---------- Stems ----------
export function runStems(id: string) {
  if (busy(getJobs(id).stems)) return;
  set(id, 'stems', { state: 'queued', progress: 0, label: 'Waiting for other jobs', error: undefined });
  enqueue(async () => {
    try {
      set(id, 'stems', { state: 'running', progress: 0, label: 'Preparing the audio' });
      const blob = await getAudio(id);
      if (!blob) throw new Error('Audio not found');
      const { separateStems } = await import('./stems/separate');
      const r = await separateStems(blob, getSettings().stemModelUrl, (p, label, eta) => set(id, 'stems', { progress: p, label, eta }));
      await saveStems(id, r.blobs);
      await patchSong(id, { stems: { model: 'htdemucs', createdAt: Date.now(), seconds: r.seconds, webgpu: r.webgpu, peaks: r.peaks } });

      set(id, 'stems', { progress: 0.985, label: 'Re-reading chords and drums from the stems', eta: null });
      const mix = await mixSamples(id, 22050);
      const harmonic = await stemSamples(id, ['bass', 'other'], 22050);
      const drums = await stemSamples(id, ['drums'], 22050);
      const analysis = await runAnalysis(mix, 22050, () => {}, { harmonic: harmonic ?? undefined, drums: drums ?? undefined });
      await patchSong(id, { analysis });
      set(id, 'stems', { state: 'done', progress: 1, label: `Separated in ${Math.round(r.seconds)} s${r.webgpu ? ' (GPU)' : ''}` });

      // Cleaner tabs and lyrics from the isolated parts.
      runStemNotes(id);
      const s = getSettings();
      if (s.lyricsEngine !== 'off') runLyrics(id);
    } catch (err: any) {
      set(id, 'stems', { state: 'error', progress: null, label: 'Failed', error: String(err?.message ?? err) });
    }
  });
}

// ---------- Notes / tabs ----------
export function runNotes(id: string) {
  if (busy(getJobs(id).notes)) return;
  set(id, 'notes', { state: 'queued', progress: 0, label: 'Waiting', error: undefined });
  enqueue(async () => {
    try {
      const song = await getSong(id);
      if (song?.stems) {
        await stemNotesWork(id);
        return;
      }
      set(id, 'notes', { state: 'running', progress: 0, label: 'Loading Basic Pitch' });
      const x = await mixSamples(id, 22050);
      const { transcribeNotes } = await import('./ai/notes');
      const notes = await transcribeNotes(x, (p) => set(id, 'notes', { progress: p, label: 'Transcribing notes' }));
      await patchSong(id, { notes });
      set(id, 'notes', { state: 'done', progress: 1, label: `${notes.length} notes` });
    } catch (err: any) {
      set(id, 'notes', { state: 'error', progress: null, label: 'Failed', error: String(err?.message ?? err) });
    }
  });
}

async function stemNotesWork(id: string) {
  try {
    set(id, 'notes', { state: 'running', progress: 0, label: 'Loading Basic Pitch' });
    const { transcribeNotes } = await import('./ai/notes');
    const other = await stemSamples(id, ['other'], 22050);
    const bass = await stemSamples(id, ['bass'], 22050);
    if (!other || !bass) throw new Error('Stems not found');
    const o = await transcribeNotes(other, (p) => set(id, 'notes', { progress: p * 0.6, label: 'Transcribing guitar & keys' }));
    const b = await transcribeNotes(bass, (p) => set(id, 'notes', { progress: 0.6 + p * 0.4, label: 'Transcribing the bass' }));
    await patchSong(id, { stemNotes: { other: o, bass: b } });
    set(id, 'notes', { state: 'done', progress: 1, label: `${o.length + b.length} notes from stems` });
  } catch (err: any) {
    set(id, 'notes', { state: 'error', progress: null, label: 'Failed', error: String(err?.message ?? err) });
  }
}

export function runStemNotes(id: string) {
  if (busy(getJobs(id).notes)) return;
  set(id, 'notes', { state: 'queued', progress: 0, label: 'Waiting', error: undefined });
  enqueue(() => stemNotesWork(id));
}

// ---------- Lyrics ----------
export function runLyrics(id: string) {
  if (busy(getJobs(id).lyrics)) return;
  const s = getSettings();
  if (s.lyricsEngine === 'off') {
    set(id, 'lyrics', { state: 'skipped', label: 'Lyrics are turned off in Settings' });
    return;
  }
  set(id, 'lyrics', { state: 'queued', progress: 0, label: 'Waiting', error: undefined });
  enqueue(async () => {
    try {
      set(id, 'lyrics', { state: 'running', progress: null, label: 'Preparing audio' });
      const vocals = await stemSamples(id, ['vocals'], 16000);
      const x = vocals ?? (await mixSamples(id, 16000));
      const { transcribeLyrics } = await import('./ai/lyrics');
      const lyrics = await transcribeLyrics(x, getSettings(), (p, label) => set(id, 'lyrics', { progress: p, label: vocals ? label + ' (isolated vocals)' : label }));
      await patchSong(id, { lyrics: { ...lyrics, fromVocals: !!vocals } });
      set(id, 'lyrics', { state: 'done', progress: 1, label: lyrics.words.length ? `${lyrics.words.length} words` : 'No vocals found' });
    } catch (err: any) {
      set(id, 'lyrics', { state: 'error', progress: null, label: 'Failed', error: String(err?.message ?? err) });
    }
  });
}

/** Start whatever the song is still missing. */
export async function ensureJobs(id: string) {
  const song = await getSong(id);
  if (!song) return;
  const s = getSettings();
  const j = getJobs(id);
  if (!song.stems && s.autoStems && j.stems.state === 'idle') {
    runStems(id); // also queues stem tabs + vocal lyrics afterwards
    return;
  }
  if (song.stems && !song.stemNotes && s.autoNotes && j.notes.state === 'idle') runStemNotes(id);
  else if (!song.stems && !song.notes && s.autoNotes && j.notes.state === 'idle') runNotes(id);
  if (!song.lyrics && s.lyricsEngine !== 'off' && j.lyrics.state === 'idle') runLyrics(id);
}
