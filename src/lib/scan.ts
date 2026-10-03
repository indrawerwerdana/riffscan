import { decodeBlob, runAnalysis, toMono } from './audio/decode';
import { ensureJobs } from './jobs';
import { saveAudio, saveSong } from './store/library';
import type { Song } from './types';

export interface ScanMeta {
  title: string;
  source: Song['source'];
}

export const MAX_MINUTES = 15;

export async function scanBlob(blob: Blob, meta: ScanMeta, onProgress: (p: number, label: string) => void): Promise<string> {
  onProgress(0.01, 'Opening the audio');
  let buffer: AudioBuffer;
  try {
    buffer = await decodeBlob(blob);
  } catch {
    throw new Error("This file couldn't be opened. Try an MP3, WAV, M4A, FLAC or OGG file.");
  }
  if (buffer.duration < 3) throw new Error('This audio is shorter than 3 seconds.');
  if (buffer.duration > MAX_MINUTES * 60) throw new Error(`Songs up to ${MAX_MINUTES} minutes are supported.`);
  onProgress(0.05, 'Preparing the audio');
  const mono = await toMono(buffer, 22050);
  const analysis = await runAnalysis(mono, 22050, (p, label) => onProgress(0.06 + p * 0.92, label));
  const id = (crypto.randomUUID?.() ?? String(Date.now())) as string;
  const song: Song = {
    id,
    title: meta.title || 'Untitled song',
    createdAt: Date.now(),
    source: meta.source,
    duration: buffer.duration,
    analysis,
  };
  await saveAudio(id, blob);
  await saveSong(song);
  onProgress(1, 'Done');
  ensureJobs(id);
  return id;
}

export function titleFromFile(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}
