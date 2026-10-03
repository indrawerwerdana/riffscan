// Practice coach powered by an open-weight LLM on Groq.
import { chordLabel, keyLabel, pentatonic, prefersFlats, suggestCapo } from '../music/theory';
import type { Settings } from '../store/settings';
import type { Song } from '../types';

async function groqFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Couldn't reach Groq from this browser (network or browser block). Check your connection, or use in-browser mode in Settings.");
  }
}


export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export function songContext(song: Song, transpose: number): string {
  const a = song.analysis;
  const flats = prefersFlats(a.key);
  const lines: string[] = [];
  lines.push(`Title: ${song.title}`);
  lines.push(`Key: ${keyLabel(a.key, transpose)} · Tempo: ${Math.round(a.bpm)} BPM · 4/4`);
  const capo = suggestCapo(a.chords.map((c) => ({ chord: c, start: c.start, end: c.end })), a.key, transpose);
  if (capo.capo > 0) lines.push(`Suggested capo: ${capo.capo} (${capo.shapesKey})`);
  for (const s of a.sections) {
    const seq: string[] = [];
    for (const c of a.chords) {
      if (c.end <= s.start || c.start >= s.end || c.root < 0) continue;
      const l = chordLabel(c, transpose, flats);
      if (seq[seq.length - 1] !== l) seq.push(l);
    }
    lines.push(`${s.label} (${Math.round(s.start)}s–${Math.round(s.end)}s): ${seq.slice(0, 24).join(' ')}`);
  }
  if (song.lyrics?.segments.length) {
    const text = song.lyrics.segments.map((g) => g.text).join(' / ');
    lines.push(`Lyrics (excerpt): ${text.slice(0, 900)}`);
  }
  lines.push(`Pentatonic for soloing: ${pentatonic(a.key, transpose).join(' ')}`);
  return lines.join('\n');
}

export async function askCoach(song: Song, transpose: number, history: ChatMsg[], s: Settings): Promise<string> {
  const system =
    'You are a friendly, expert music teacher and producer inside a practice app called Riffscan. ' +
    'The app has analysed a song; its data is below. Chords were detected automatically and may contain small mistakes. ' +
    'Give practical, specific advice for guitar, bass, drums, piano or singing. Keep answers short (under 180 words), ' +
    'use simple English, and format with short paragraphs or "-" bullet points. Use chord names, not tabs, unless asked.\n\n' +
    songContext(song, transpose);
  const r = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: s.groqChatModel,
      temperature: 0.5,
      max_tokens: 500,
      messages: [{ role: 'system', content: system }, ...history.slice(-8)],
    }),
  });
  if (!r.ok) {
    let msg = `Groq error ${r.status}`;
    try {
      msg = (await r.json())?.error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() ?? '';
}

export async function testGroqKey(key: string): Promise<boolean> {
  const r = await groqFetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  return r.ok;
}
