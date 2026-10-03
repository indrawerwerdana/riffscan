import { useState } from 'react';
import { askCoach, type ChatMsg } from '../lib/ai/coach';
import { diatonicChords, keyLabel, pentatonic, suggestCapo } from '../lib/music/theory';
import { isHardOnGuitar } from '../lib/music/shapes';
import { useSettings } from '../lib/store/settings';
import type { Song } from '../lib/types';
import { Icon } from './Icon';

const SUGGESTIONS = [
  'Give me an easy strumming pattern for this song',
  'Simplify the chords for a beginner',
  'How should I practise the hardest part?',
  'What scale can I solo with, and where on the neck?',
];

function Rich({ text }: { text: string }) {
  // Tiny, safe formatter: paragraphs, "-" bullets and **bold**.
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </>
  );
}

export function Coach({ song, transpose, onOpenSettings }: { song: Song; transpose: number; onOpenSettings: () => void }) {
  const s = useSettings();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const a = song.analysis;
  const capo = suggestCapo(a.chords.map((c) => ({ chord: c, start: c.start, end: c.end })), a.key, transpose);
  const hard = Array.from(new Set(a.chords.filter((c) => c.root >= 0 && isHardOnGuitar({ root: c.root + transpose, quality: c.quality })).map((c) => c.root + ':' + c.quality))).length;

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    const next: ChatMsg[] = [...msgs, { role: 'user', content: q.trim() }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    setErr('');
    try {
      const reply = await askCoach(song, transpose, next, s);
      setMsgs([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card sage span-4" aria-labelledby="coach-title" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-head">
        <span className="card-icon"><Icon name="spark" /></span>
        <div>
          <h2 className="card-title" id="coach-title">Practice coach</h2>
          <p className="card-sub">{s.groqKey ? `AI · ${s.groqChatModel}` : 'Quick tips · add a Groq key for chat'}</p>
        </div>
      </div>

      <div className="steps" style={{ marginBottom: 12, fontSize: 14 }}>
        <div className="callout">
          <strong>Solo scale:</strong> {keyLabel(a.key, transpose).replace(' major', '').replace(' minor', 'm')} pentatonic — {pentatonic(a.key, transpose).join(' ')}
        </div>
        <div className="callout">
          <strong>Chords in this key:</strong> {diatonicChords(a.key, transpose).join(' · ')}
        </div>
        {capo.capo > 0 && (
          <div className="callout"><strong>Easier shapes:</strong> capo {capo.capo}, play {capo.shapesKey} ({Math.round(capo.easyShare * 100)}% open chords).</div>
        )}
        {hard > 0 && capo.capo === 0 && <div className="callout">{hard} barre chord{hard > 1 ? 's' : ''} here — loop those bars at 0.75× first.</div>}
      </div>

      {s.groqKey ? (
        <>
          {msgs.length > 0 && (
            <div className="coach-msgs" aria-live="polite">
              {msgs.map((m, i) => (
                <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`}>{m.role === 'user' ? m.content : <Rich text={m.content} />}</div>
              ))}
              {busy && <div className="bubble ai muted">Thinking…</div>}
            </div>
          )}
          {msgs.length === 0 && (
            <div className="suggest">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          )}
          {err && <p className="error">{err}</p>}
          <form
            className="prompt"
            style={{ marginTop: 'auto' }}
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="coach-q" className="sr-only">Ask the coach</label>
            <input id="coach-q" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this song…" />
            <button type="submit" className="icon-btn dark" aria-label="Send" disabled={busy}><Icon name="send" /></button>
          </form>
        </>
      ) : (
        <button type="button" className="pill lime" style={{ marginTop: 'auto', alignSelf: 'flex-start' }} onClick={onOpenSettings}>
          <Icon name="settings" /> Connect Groq for AI chat
        </button>
      )}
    </section>
  );
}
