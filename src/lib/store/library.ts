import { createStore, del, get, set, values } from 'idb-keyval';
import { useEffect, useState } from 'react';
import type { Song, StemName } from '../types';

const songs = createStore('riffscan-songs', 'songs');
const audio = createStore('riffscan-audio', 'audio');
const stemStore = createStore('riffscan-stems', 'stems');
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function listSongs(): Promise<Song[]> {
  const all = (await values(songs)) as Song[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const getSong = (id: string) => get<Song>(id, songs);
export const getAudio = (id: string) => get<Blob>(id, audio);

export async function saveSong(song: Song) {
  await set(song.id, song, songs);
  emit();
}

export async function patchSong(id: string, patch: Partial<Song>) {
  const s = await getSong(id);
  if (!s) return;
  await saveSong({ ...s, ...patch });
}

export async function saveAudio(id: string, blob: Blob) {
  await set(id, blob, audio);
}

export async function deleteSong(id: string) {
  await del(id, songs);
  await del(id, audio);
  await del(id, stemStore);
  emit();
}

export const getStems = (id: string) => get<Record<StemName, Blob>>(id, stemStore);
export async function saveStems(id: string, blobs: Record<StemName, Blob>) {
  await set(id, blobs, stemStore);
}
export async function deleteStems(id: string) {
  await del(id, stemStore);
  const s = await getSong(id);
  if (s) await saveSong({ ...s, stems: undefined, stemNotes: undefined });
}

export function useLibrary(): Song[] | null {
  const [list, setList] = useState<Song[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => listSongs().then((l) => alive && setList(l)).catch(() => alive && setList([]));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);
  return list;
}

export function useSong(id: string): Song | null | undefined {
  const [song, setSong] = useState<Song | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => getSong(id).then((s) => alive && setSong(s ?? null));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [id]);
  return song;
}
