import { useSyncExternalStore } from 'react';

export interface Settings {
  groqKey: string;
  lyricsEngine: 'auto' | 'groq' | 'browser' | 'off';
  language: string; // 'auto' or ISO code
  browserWhisperModel: string;
  groqWhisperModel: string;
  groqChatModel: string;
  autoNotes: boolean;
  a4: number;
  simpleChords: boolean;
  autoStems: boolean;
  stemModelUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  groqKey: '',
  lyricsEngine: 'auto',
  language: 'auto',
  browserWhisperModel: 'onnx-community/whisper-base_timestamped',
  groqWhisperModel: 'whisper-large-v3-turbo',
  groqChatModel: 'llama-3.3-70b-versatile',
  autoNotes: true,
  a4: 440,
  simpleChords: false,
  autoStems: false,
  stemModelUrl: 'models/htdemucs.onnx',
};

const KEY = 'riffscan.settings.v1';
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
