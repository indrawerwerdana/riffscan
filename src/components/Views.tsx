import { memo, useEffect, useMemo, useRef } from 'react';
import type { AudioEngine } from '../lib/audio/engine';
import type { SongJobs } from '../lib/jobs';
import { runLyrics, runNotes } from '../lib/jobs';
import { BASS_TUNING, GUITAR_TUNING, bassLine, buildSheet, buildTab, chordGrid, indexAt, tabText, type SheetLine } from '../lib/music/structure';
import { chordLabel, fmtTime } from '../lib/music/theory';
import type { Bar, Song } from '../lib/types';
import { Icon } from './Icon';

function JobNotice({ job, what, onRun }: { job: SongJobs['notes']; what: string; onRun: () => void }) {
  if (job.state === 'running' || job.state === 'queued') {
    return (
      <div className="callout" role="status">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>{job.label || `Working on ${what}…`}</span>
          {job.progress != null && <span className="muted">{Math.round(job.progress * 100)}%</span>}
        </div>
        <div className="bar-track" style={{ marginTop: 8 }}>
          <div className={`bar-fill ${job.progress == null ? 'hatch' : ''}`} style={{ width: `${job.progress == null ? 100 : Math.max(4, job.progress * 100)}%`, background: job.progress == null ? undefined : undefined }} />
        </div>
      </div>
    );
  }
  return (
    <div className="callout">
      {job.state === 'error' && <p className="error" style={{ marginTop: 0 }}>{job.error}</p>}
      {job.state === 'skipped' && <p className="muted" style={{ marginTop: 0 }}>{job.label}</p>}
      <button type="button" className="pill lime" onClick={onRun}>
        <Icon name="spark" /> {job.state === 'error' ? 'Try again' : `Transcribe ${what}`}
      </button>
    </div>
  );
}

// ---------- Chords + lyrics ----------
export function SheetView({ song, engine, transpose, flats, jobs }: { song: Song; engine: AudioEngine; transpose: number; flats: boolean; jobs: SongJobs }) {
  const lines = useMemo<SheetLine[]>(() => (song.lyrics ? buildSheet(song.analysis, song.lyrics, transpose, flats) : []), [song.lyrics, song.analysis, transpose, flats]);
  const t = engine.time;
  const cur = lines.findIndex((l) => t >= l.start - 0.15 && t < l.end + 0.4);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${cur}"]`);
    if (el && box.current && engine.playing) {
      const b = box.current;
      const top = el.offsetTop - b.offsetTop - b.clientHeight / 3;
      b.scrollTo({ top, behavior: 'smooth' });
    }
  }, [cur, engine.playing]);

  if (!song.lyrics) {
    return (
      <div className="steps">
        <p className="muted" style={{ margin: 0 }}>Lyrics appear here with chords above the words. Meanwhile, the chord grid works without them.</p>
        <JobNotice job={jobs.lyrics} what="lyrics" onRun={() => runLyrics(song.id)} />
      </div>
    );
  }
  if (!song.lyrics.words.length) return <div className="callout">No vocals were found in this song. Use the chord grid instead.</div>;
  const ci = song.analysis.chords.findIndex((c) => t >= c.start && t < c.end);
  const curChordStart = ci >= 0 ? song.analysis.chords[ci].start : -1;
  return (
    <div className="sheet" ref={box}>
      {lines.map((l, i) => (
        <div key={i}>
          {l.section && <div className="sheet-section">{l.section}</div>}
          <div className={`sheet-line ${i === cur ? 'on' : ''}`} data-line={i}>
            {l.kind === 'instrumental' ? (
              <div className="row" style={{ gap: 6 }}>
                {l.tokens.map((tk, j) => (
                  <button key={j} type="button" className="tok" onClick={() => engine.seek(tk.start + 0.01)}>
                    <span className="c"><span className={tk.chordStart === curChordStart ? 'on' : ''}>{tk.chord}</span></span>
                  </button>
                ))}
                <span className="muted" style={{ fontSize: 13 }}>instrumental</span>
              </div>
            ) : (
              l.tokens.map((tk, j) => (
                <button key={j} type="button" className="tok" onClick={() => engine.seek(Math.max(0, (tk.chordStart ?? tk.start) - 0.05))}>
                  <span className="c">{tk.chord && <span className={tk.chordStart === curChordStart ? 'on' : ''}>{tk.chord}</span>}</span>
                  <span className={`w ${t >= tk.start && t < tk.end + 0.08 ? 'on' : ''}`}>{tk.text}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ))}
      <p className="note" style={{ marginTop: 10 }}>
        Lyrics by {song.lyrics.engine === 'groq' ? 'Groq Whisper' : 'Whisper in your browser'}{song.lyrics.fromVocals ? ' from the isolated vocals' : ''} · auto-generated, may contain mistakes.{' '}
        <button type="button" className="pill sm ghost" onClick={() => runLyrics(song.id)}>Redo lyrics</button>
      </p>
    </div>
  );
}

// ---------- Chord grid ----------
export const GridView = memo(function GridView({ song, bars, barIdx, engine, transpose, flats }: { song: Song; bars: Bar[]; barIdx: number; engine: AudioEngine; transpose: number; flats: boolean }) {
  const grid = useMemo(() => chordGrid(song.analysis, bars), [song.analysis, bars]);
  return (
    <div className="grid-bars">
      {bars.map((b, i) => (
        <button key={i} type="button" className={`gbar ${i === barIdx ? 'on' : ''}`} onClick={() => engine.seek(b.start + 0.01)} aria-label={`Bar ${b.index + 1}`}>
          <span className="n">{b.index < 0 ? 'pickup' : `bar ${b.index + 1}`} · {fmtTime(b.start)}</span>
          <span className="cs">
            {grid[i].map((c, j) => (
              <span key={j} className={c.root < 0 ? 'muted' : ''}>{c.root < 0 ? '—' : chordLabel(c, transpose, flats)}</span>
            ))}
          </span>
        </button>
      ))}
    </div>
  );
});

// ---------- Tabs ----------
export function TabView({ song, bars, barIdx, engine, kind, jobs }: { song: Song; bars: Bar[]; barIdx: number; engine: AudioEngine; kind: 'guitar' | 'bass'; jobs: SongJobs }) {
  const fromStems = !!song.stemNotes;
  const tab = useMemo(() => {
    if (song.stemNotes) {
      if (kind === 'guitar') return song.stemNotes.other ? buildTab(song.stemNotes.other, bars, GUITAR_TUNING, [40, 88], 3, 0.25) : null;
      return song.stemNotes.bass ? buildTab(bassLine(song.stemNotes.bass), bars, BASS_TUNING, [28, 60], 1, 0.15) : null;
    }
    if (!song.notes) return null;
    if (kind === 'guitar') return buildTab(song.notes.filter((n) => n.p >= 48), bars, GUITAR_TUNING, [40, 88], 3, 0.28);
    return buildTab(bassLine(song.notes), bars, BASS_TUNING, [28, 60], 1, 0.2);
  }, [song.notes, song.stemNotes, bars, kind]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-bar="${barIdx}"]`);
    if (el && box.current && engine.playing) box.current.scrollTo({ top: el.offsetTop - box.current.offsetTop - 20, behavior: 'smooth' });
  }, [barIdx, engine.playing]);
  if (!tab) {
    return (
      <div className="steps">
        <p className="muted" style={{ margin: 0 }}>Tabs are made from AI note transcription (Spotify Basic Pitch, running on your device).</p>
        <JobNotice job={jobs.notes} what="notes" onRun={() => runNotes(song.id)} />
      </div>
    );
  }
  const strings = kind === 'guitar' ? ['E', 'A', 'D', 'G', 'B', 'e'] : ['E', 'A', 'D', 'G'];
  const bar = bars[barIdx];
  const step = bar ? Math.max(0, Math.min(15, Math.floor(((engine.time - bar.start) / (bar.end - bar.start)) * 16))) : -1;
  return (
    <div>
      <p className="note" style={{ marginTop: 0 }}>
        {kind === 'guitar' ? 'Guitar / keys notes' : 'Bass line'} · one box = one bar, 16th-note grid ·{' '}
        {fromStems ? `AI transcription from the separated ${kind === 'guitar' ? '"other"' : 'bass'} stem.` : 'AI transcription from the full mix — separate the instruments for cleaner tabs.'}
      </p>
      <div className="tab-wrap" ref={box}>
        {bars.map((b, i) => {
          const lines = tabText(tab[i], strings);
          return (
            <div key={i} className={`tab-bar ${i === barIdx ? 'on' : ''}`} data-bar={i}>
              <div className="meta">
                <span>{b.index < 0 ? 'pickup' : `bar ${b.index + 1}`}</span>
                <button type="button" className="pill sm ghost" style={{ minHeight: 24, padding: '0 8px' }} onClick={() => engine.seek(b.start + 0.01)} aria-label={`Play from bar ${b.index + 1}`}>
                  <Icon name="play" size={11} /> {fmtTime(b.start)}
                </button>
              </div>
              <pre aria-label={`Tab for bar ${b.index + 1}`}>
                {i === barIdx && step >= 0 && <span className="tab-cursor" style={{ left: `calc(${2 + step * 3}ch - 0.1ch)` }} />}
                {lines.map((l, k) => `${strings[strings.length - 1 - k].padEnd(1)}|${l}|`).join('\n')}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Drums ----------
export function DrumView({ song, bars, barIdx, engine }: { song: Song; bars: Bar[]; barIdx: number; engine: AudioEngine }) {
  const d = song.analysis.drums;
  // Drum bars start at the first downbeat; skip a pickup bar if there is one.
  const offset = bars[0]?.index === -1 ? 1 : 0;
  const di = Math.max(0, barIdx - offset);
  const bar = d.bars[di];
  const b = bars[barIdx];
  const step = b ? Math.floor(((engine.time - b.start) / (b.end - b.start)) * 16) : -1;
  const rows: [string, keyof NonNullable<typeof bar>][] = [['Hi-hat', 'hat'], ['Snare', 'snare'], ['Kick', 'kick']];
  if (!bar) return <div className="callout">No drum pattern for this part.</div>;
  return (
    <div className="steps">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>Bar {b ? b.index + 1 : '–'} · follows playback</span>
        <span className="chip">{song.analysis.source === 'stems' ? 'From the drum stem' : 'Beta · full mix'} · {d.confidence > 0.7 ? 'steady groove' : 'loose timing'}</span>
      </div>
      <div className="scroll-x">
        <div className="drum-grid" style={{ minWidth: 560 }}>
          <div className="drum-row" aria-hidden="true">
            <span />
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="muted" style={{ fontSize: 11, textAlign: 'center' }}>{i % 4 === 0 ? i / 4 + 1 : ['', 'e', '&', 'a'][i % 4]}</span>
            ))}
          </div>
          {rows.map(([name, k]) => (
            <div className="drum-row" key={k}>
              <span style={{ fontSize: 13 }}>{name}</span>
              {bar[k].map((v, i) => (
                <span key={i} className={`drum-cell ${v ? 'hit' : ''} ${i === step ? 'cur' : ''}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="row">
        <button type="button" className="pill sm" onClick={() => engine.seek((bars[barIdx - 1] ?? bars[0]).start + 0.01)}>Previous bar</button>
        <button type="button" className="pill sm" onClick={() => engine.seek((bars[barIdx + 1] ?? bars[barIdx]).start + 0.01)}>Next bar</button>
        <span className="note">Detected from the full mix (kick, snare, hi-hat). Fills and cymbals may be missed.</span>
      </div>
    </div>
  );
}

export { indexAt };
