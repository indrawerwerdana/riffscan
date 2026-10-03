// Lyrics transcription: Groq Whisper (fast, needs a free key) or Whisper in the browser.
import { encodeWav16 } from '../audio/decode';
import type { Settings } from '../store/settings';
import type { LyricWord, Lyrics } from '../types';

async function groqFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Couldn't reach Groq from this browser (network or browser block). Check your connection, or use in-browser mode in Settings.");
  }
}


type Progress = (p: number | null, label: string) => void;

// Phrases Whisper tends to invent over instrumental music.
const HALLUCINATIONS = [
  /thank(s| you) for watching/i,
  /subscribe/i,
  /terima kasih telah menonton/i,
  /sampai jumpa/i,
  /^\W*(music|musik|applause|♪+)\W*$/i,
  /amara\.org/i,
];

const isJunk = (t: string) => !t.trim() || HALLUCINATIONS.some((r) => r.test(t.trim()));

export async function groqTranscribe(samples16k: Float32Array, s: Settings, onProgress: Progress): Promise<Lyrics> {
  onProgress(null, 'Sending audio to Groq Whisper');
  const fd = new FormData();
  fd.append('file', encodeWav16(samples16k, 16000), 'audio.wav');
  fd.append('model', s.groqWhisperModel);
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  fd.append('timestamp_granularities[]', 'segment');
  fd.append('temperature', '0');
  if (s.language && s.language !== 'auto') fd.append('language', s.language);
  const r = await groqFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.groqKey}` },
    body: fd,
  });
  if (!r.ok) {
    let msg = `Groq error ${r.status}`;
    try {
      const j = await r.json();
      msg = j?.error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = await r.json();
  const segments: { start: number; end: number; text: string; no_speech_prob?: number }[] = j.segments ?? [];
  const bad = segments.filter((g) => (g.no_speech_prob ?? 0) > 0.6 || isJunk(g.text));
  const inBad = (t: number) => bad.some((g) => t >= g.start - 0.05 && t <= g.end + 0.05);
  let words: LyricWord[] = (j.words ?? []).map((w: any) => ({ text: String(w.word).trim(), start: w.start, end: w.end }));
  if (!words.length) words = spreadWords(segments);
  words = words.filter((w) => w.text && !inBad(w.start));
  onProgress(1, 'Lyrics ready');
  return {
    engine: 'groq',
    model: s.groqWhisperModel,
    language: j.language,
    words,
    segments: segments.filter((g) => !bad.includes(g)).map((g) => ({ start: g.start, end: g.end, text: g.text.trim() })),
  };
}

function spreadWords(segments: { start: number; end: number; text: string }[]): LyricWord[] {
  const out: LyricWord[] = [];
  for (const g of segments) {
    const parts = g.text.trim().split(/\s+/).filter(Boolean);
    const step = (g.end - g.start) / Math.max(1, parts.length);
    parts.forEach((p, i) => out.push({ text: p, start: g.start + i * step, end: g.start + (i + 1) * step }));
  }
  return out;
}

export function browserTranscribe(samples16k: Float32Array, s: Settings, onProgress: Progress): Promise<Lyrics> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    const files = new Map<string, number>();
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'load') {
        files.set(m.file, m.progress);
        const vals = [...files.values()];
        onProgress((vals.reduce((a, b) => a + b, 0) / vals.length) * 0.3, 'Downloading the Whisper model (first time only)');
      } else if (m.type === 'status') {
        onProgress(null, 'Transcribing lyrics on your device');
      } else if (m.type === 'done') {
        worker.terminate();
        const chunks: { text: string; timestamp: [number, number | null] }[] = m.chunks;
        let words: LyricWord[];
        const segs = chunks.map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.4, text: c.text.trim() }));
        if (m.segmentLevel) words = spreadWords(segs);
        else words = segs.map((c) => ({ text: c.text, start: c.start, end: c.end }));
        words = words.filter((w) => !isJunk(w.text));
        resolve({ engine: 'browser', model: s.browserWhisperModel, words, segments: groupSegments(words) });
      } else if (m.type === 'error') {
        worker.terminate();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Whisper worker failed'));
    };
    worker.postMessage({ audio: samples16k, model: s.browserWhisperModel, language: s.language }, [samples16k.buffer]);
  });
}

/** Group words into lines using pauses. */
export function groupSegments(words: LyricWord[]) {
  const segs: { start: number; end: number; text: string }[] = [];
  let cur: LyricWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    segs.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' ') });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0);
    if (prev && (w.start - prev.end > 0.7 || len > 44 || /[.!?]$/.test(prev.text))) flush();
    cur.push(w);
  }
  flush();
  return segs;
}

export async function transcribeLyrics(samples16k: Float32Array, s: Settings, onProgress: Progress): Promise<Lyrics> {
  const useGroq = s.lyricsEngine === 'groq' || (s.lyricsEngine === 'auto' && !!s.groqKey);
  if (useGroq) {
    if (!s.groqKey) throw new Error('Add your Groq API key in Settings, or switch lyrics to "In the browser".');
    try {
      return await groqTranscribe(samples16k.slice(), s, onProgress);
    } catch (err) {
      if (s.lyricsEngine === 'groq') throw err;
      onProgress(null, 'Groq failed, switching to in-browser Whisper');
    }
  }
  return browserTranscribe(samples16k, s, onProgress);
}
