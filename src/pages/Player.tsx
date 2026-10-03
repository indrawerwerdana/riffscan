import { useEffect, useMemo, useState } from 'react';
import { Coach } from '../components/Coach';
import { StemsCard } from '../components/Stems';
import { FretDiagram, PianoDiagram } from '../components/Diagrams';
import { Icon } from '../components/Icon';
import { Timeline } from '../components/Timeline';
import { Transport } from '../components/Transport';
import { DrumView, GridView, SheetView, TabView } from '../components/Views';
import { useEngine, useEngineFor } from '../lib/audio/engine';
import { download, exportMidi, safeName } from '../lib/export/files';
import { ensureJobs, useJobs } from '../lib/jobs';
import { buildSheet, chordAt, getBars, indexAt, sheetToText, simplifyChords } from '../lib/music/structure';
import { chordLabel, keyLabel, prefersFlats, suggestCapo } from '../lib/music/theory';
import { deleteSong, getAudio, getStems, patchSong, useSong } from '../lib/store/library';
import { updateSettings, useSettings } from '../lib/store/settings';
import type { Song } from '../lib/types';
import { navigate } from '../router';

type View = 'sheet' | 'grid' | 'guitar' | 'bass' | 'drums';
const VIEWS: [View, string, string][] = [
  ['sheet', 'Chords & lyrics', 'lyrics'],
  ['grid', 'Chord grid', 'grid'],
  ['guitar', 'Guitar tab', 'guitar'],
  ['bass', 'Bass tab', 'wave'],
  ['drums', 'Drums', 'drum'],
];

export function Player({ id }: { id: string }) {
  const rawSong = useSong(id);
  const settings = useSettings();
  const simple = settings.simpleChords;
  const song: Song | null | undefined = useMemo(
    () => (rawSong && simple ? { ...rawSong, analysis: { ...rawSong.analysis, chords: simplifyChords(rawSong.analysis.chords) } } : rawSong),
    [rawSong, simple],
  );
  const [blob, setBlob] = useState<Blob | null | undefined>(undefined);
  useEffect(() => {
    getAudio(id).then((b) => setBlob(b ?? null));
    ensureJobs(id);
  }, [id]);
  const engine = useEngineFor(blob);
  useEngine(engine);
  const jobs = useJobs(id);
  const [view, setView] = useState<View>('sheet');
  const [inst, setInst] = useState<'guitar' | 'uke' | 'piano'>('guitar');
  const [transpose, setTransposeRaw] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);

  const a = song?.analysis;
  const bars = useMemo(() => (a ? getBars(a) : []), [a]);
  useEffect(() => {
    if (engine && a) {
      engine.beats = a.beats;
      engine.downbeat = a.downbeat;
    }
  }, [engine, a]);

  // Load separated stems into the player when they exist.
  const stemsKey = rawSong?.stems?.createdAt;
  useEffect(() => {
    if (!engine) return;
    if (!stemsKey) {
      if (engine.stems) engine.setStems(null);
      return;
    }
    let alive = true;
    getStems(id).then((b) => alive && b && engine.setStems(b));
    return () => {
      alive = false;
    };
  }, [engine, stemsKey, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!engine || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  if (song === undefined || blob === undefined) return <div className="empty">Loading…</div>;
  if (!song || !a) {
    return (
      <div className="empty">
        <p>This song isn't in your library.</p>
        <a className="pill" href="#/">Scan a song</a>
      </div>
    );
  }
  if (!engine) return <div className="empty">{blob === null ? 'The audio for this song is missing.' : 'Preparing audio…'}</div>;

  const setTranspose = (n: number) => setTransposeRaw(Math.max(-11, Math.min(11, n)));
  const flats = prefersFlats({ ...a.key, tonic: a.key.tonic + transpose });
  const t = engine.time;
  const ci = chordAt(a, t);
  const chord = a.chords[ci];
  const next = a.chords.slice(ci + 1).find((c) => c.root >= 0);
  const biRaw = bars.findIndex((b) => t >= b.start && t < b.end);
  const bi = biRaw >= 0 ? biRaw : t >= (bars[bars.length - 1]?.start ?? 0) ? bars.length - 1 : 0;
  const beatIdx = indexAt(a.beats, t);
  const beatInBar = beatIdx < 0 ? -1 : (((beatIdx - a.downbeat) % 4) + 4) % 4;
  const si = Math.max(0, a.sections.findIndex((s) => t >= s.start && t < s.end));
  const capo = suggestCapo(a.chords.map((c) => ({ chord: c, start: c.start, end: c.end })), a.key, transpose);
  const shown = chord.root >= 0 ? chord : next ?? chord;
  const shapeChord = shown.root < 0 ? shown : inst === 'piano' ? { ...shown, root: shown.root + transpose } : { ...shown, root: shown.root + transpose - capo.capo };
  const prog = Math.min(1, (t - chord.start) / Math.max(0.01, chord.end - chord.start));

  // Chord usage (top 6 by time).
  const usage = (() => {
    const m = new Map<string, number>();
    for (const c of a.chords) if (c.root >= 0) m.set(chordLabel(c, transpose, flats), (m.get(chordLabel(c, transpose, flats)) ?? 0) + c.end - c.start);
    const arr = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 7);
    const max = arr[0]?.[1] ?? 1;
    return arr.map(([n, v]) => ({ n, h: v / max }));
  })();
  const curName = chord.root >= 0 ? chordLabel(chord, transpose, flats) : '';

  const loopSection = () => {
    if (engine.loop) return engine.setLoop(null);
    const s = a.sections[si];
    engine.setLoop({ start: s.start, end: s.end });
  };
  const loopLabel = engine.loop
    ? a.sections.find((s) => Math.abs(s.start - engine.loop!.start) < 0.05 && Math.abs(s.end - engine.loop!.end) < 0.05)?.label ?? 'A–B loop'
    : '';

  const exportSheet = () => {
    const text = song.lyrics
      ? sheetToText(song.title, `Key: ${keyLabel(a.key, transpose)} · ${Math.round(a.bpm)} BPM${capo.capo ? ` · Capo ${capo.capo}` : ''}`, buildSheet(a, song.lyrics, transpose, flats))
      : `${song.title}\nKey: ${keyLabel(a.key, transpose)} · ${Math.round(a.bpm)} BPM\n\n` +
        a.sections
          .map((s) => {
            const seq: string[] = [];
            for (const c of a.chords) if (c.start < s.end && c.end > s.start && c.root >= 0) seq.push(chordLabel(c, transpose, flats));
            return `[${s.label}]\n| ${seq.join(' | ')} |`;
          })
          .join('\n\n');
    download(`${safeName(song.title)}-chords.txt`, text);
    setMenu(false);
  };

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#/library">Library</a> <span aria-hidden="true">→</span> <span>{song.source.platform ?? (song.source.type === 'file' ? 'Upload' : song.source.type === 'mic' ? 'Recording' : 'Tab capture')}</span>
      </nav>
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={() => navigate('#/library')} aria-label="Back to library"><Icon name="arrowLeft" /></button>
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = (new FormData(e.currentTarget).get('title') as string).trim();
              if (v) patchSong(song.id, { title: v });
              setRenaming(false);
            }}
            className="row"
          >
            <label htmlFor="title" className="sr-only">Song title</label>
            <input id="title" name="title" className="input" defaultValue={song.title} autoFocus style={{ fontSize: 24, minWidth: 260 }} />
            <button className="pill lime" type="submit">Save</button>
          </form>
        ) : (
          <h1 className="page-title">{song.title}</h1>
        )}
        {!renaming && <button type="button" className="icon-btn sm" onClick={() => setRenaming(true)} aria-label="Rename song"><Icon name="edit" size={15} /></button>}
        <div className="head-actions">
          <JobChip label="Stems" job={jobs.stems} done={!!song.stems} />
          <JobChip label="Tabs" job={jobs.notes} done={!!(song.notes || song.stemNotes)} />
          <JobChip label="Lyrics" job={jobs.lyrics} done={!!song.lyrics} />
          <div style={{ position: 'relative' }}>
            <button type="button" className="pill" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="download" /> Export</button>
            {menu && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 46, zIndex: 30, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
                <button type="button" className="pill ghost" onClick={exportSheet}>Chord sheet (.txt)</button>
                <button type="button" className="pill ghost" onClick={() => { setView('sheet'); setMenu(false); setTimeout(() => window.print(), 100); }}>Print / save as PDF</button>
                <button type="button" className="pill ghost" onClick={() => { exportMidi(song, transpose); setMenu(false); }}>MIDI (notes + chords)</button>
                {song.stems && (
                  <button type="button" className="pill ghost" onClick={async () => { const b = await getStems(song.id); if (b) for (const [k, v] of Object.entries(b)) download(`${safeName(song.title)}-${k}.mp3`, v); setMenu(false); }}>
                    Stems (4 × MP3)
                  </button>
                )}
                <button type="button" className="pill ghost" onClick={() => { download(`${safeName(song.title)}.json`, JSON.stringify({ ...song }, null, 1), 'application/json'); setMenu(false); }}>Analysis (.json)</button>
                <button type="button" className="pill ghost" style={{ color: 'var(--warn)' }} onClick={async () => { if (confirm('Delete this song from your library?')) { await deleteSong(song.id); navigate('#/library'); } }}>
                  <Icon name="trash" /> Delete song
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="print-only">
        <h1>{song.title}</h1>
        <p>Key: {keyLabel(a.key, transpose)} · {Math.round(a.bpm)} BPM{capo.capo ? ` · Capo ${capo.capo}` : ''}</p>
      </div>

      <div className="grid">
        {/* Now playing */}
        <section className="card lime span-4" aria-labelledby="now-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="wave" /></span>
            <div>
              <h2 className="card-title" id="now-t">Now playing</h2>
              <p className="card-sub">{a.sections[si]?.label} · bar {bars[bi] ? bars[bi].index + 1 : 1}</p>
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="now-chord" aria-live="polite">{chord.root >= 0 ? chordLabel(chord, transpose, flats) : '—'}</div>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">Next</div>
              <div className="next-chord">{next ? chordLabel(next, transpose, flats) : '—'}</div>
              <div className="stat-label">in {Math.max(0, (next?.start ?? a.duration) - t).toFixed(1)}s</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
            <div className="beats" aria-label={`Beat ${beatInBar + 1}`}>
              {[0, 1, 2, 3].map((b) => (
                <span key={b} className={`beat ${b === beatInBar ? 'on' : ''} ${b === 0 ? 'down' : ''}`}>{b + 1}</span>
              ))}
            </div>
          </div>
          <div className="bar-track" style={{ marginTop: 14 }}>
            <div className="bar-fill" style={{ width: `${prog * 100}%` }} />
          </div>
        </section>

        {/* Song DNA */}
        <section className="card span-4" aria-labelledby="dna-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="info" /></span>
            <h2 className="card-title" id="dna-t">Song DNA</h2>
          </div>
          <div className="row" style={{ gap: 22, alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">Key</div>
              <div className="stat-big" style={{ fontSize: 30 }}>{keyLabel(a.key, transpose)}</div>
            </div>
            <div>
              <div className="stat-label">Tempo</div>
              <div className="stat-big" style={{ fontSize: 30 }}>{Math.round(a.bpm)}<small> bpm</small></div>
            </div>
            <div>
              <div className="stat-label">Capo</div>
              <div className="stat-big" style={{ fontSize: 30 }}>{capo.capo || '—'}</div>
            </div>
          </div>
          <div className="seg" role="group" aria-label="Chord detail" style={{ marginTop: 10 }}>
            <button type="button" aria-pressed={!simple} onClick={() => updateSettings({ simpleChords: false })}>Full chords</button>
            <button type="button" aria-pressed={simple} onClick={() => updateSettings({ simpleChords: true })}>Simple</button>
          </div>
          <p className="card-sub" style={{ margin: '8px 0 32px' }}>
            4/4 · tuning {a.tuningCents >= 0 ? '+' : ''}{a.tuningCents}¢{capo.capo ? ` · capo ${capo.capo} = ${capo.shapesKey}` : ''}
          </p>
          <div className="usage" aria-label="Most used chords">
            {usage.map((u) => (
              <div className="usage-col" key={u.n} style={{ height: '100%', justifyContent: 'flex-end' }}>
                {u.n === curName && <span className="usage-tag" style={{ top: `calc(${(1 - u.h) * 78}% - 26px)` }}>now</span>}
                <div className={`usage-bar ${u.n === curName ? 'on' : ''}`} style={{ height: `${Math.max(10, u.h * 78)}%` }} />
                <span className="usage-name">{u.n}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Chord shape */}
        <section className="card lavender span-4" aria-labelledby="shape-t">
          <div className="card-head">
            <div>
              <h2 className="card-title" id="shape-t">How to play {chordLabel(shown, transpose, flats)}</h2>
              <p className="card-sub">{inst === 'piano' ? 'Highlighted keys' : capo.capo ? `Capo ${capo.capo} · shape ${chordLabel(shapeChord)}` : 'Standard tuning'}</p>
            </div>
            <div className="tools" role="group" aria-label="Instrument">
              {(['guitar', 'uke', 'piano'] as const).map((k) => (
                <button key={k} type="button" className="icon-btn sm" aria-pressed={inst === k} onClick={() => setInst(k)} aria-label={k === 'uke' ? 'Ukulele' : k[0].toUpperCase() + k.slice(1)} title={k}>
                  <Icon name={k} size={16} />
                </button>
              ))}
            </div>
          </div>
          {inst === 'piano' ? <div style={{ paddingTop: 30 }}><PianoDiagram chord={shapeChord} flats={flats} /></div> : <FretDiagram chord={shapeChord} instrument={inst} />}
        </section>

        {/* Timeline */}
        <section className="card span-12" aria-labelledby="tl-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="wave" /></span>
            <div>
              <h2 className="card-title" id="tl-t">Timeline</h2>
              <p className="card-sub">Click to jump · drag across the waveform to loop a part</p>
            </div>
            <div className="tools">
              {engine.loop && <button type="button" className="pill sm" onClick={() => engine.setLoop(null)}><Icon name="close" size={14} /> Clear loop</button>}
            </div>
          </div>
          <Timeline a={a} engine={engine} chordIdx={ci} sectionIdx={si} transpose={transpose} flats={flats} />
        </section>

        <StemsCard song={song} engine={engine} jobs={jobs} />

        {/* Workspace */}
        <section className="card span-8 print-keep" aria-labelledby="ws-t">
          <div className="card-head" style={{ flexWrap: 'wrap' }}>
            <h2 className="sr-only" id="ws-t">Transcription</h2>
            <div className="tabs no-print" role="tablist" aria-label="Transcription view">
              {VIEWS.map(([v, label, icon]) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={`pill sm ${view === v ? 'is-on' : ''}`} onClick={() => setView(v)}>
                  <Icon name={icon} size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
          {view === 'sheet' && <SheetView song={song} engine={engine} transpose={transpose} flats={flats} jobs={jobs} />}
          {view === 'grid' && <GridView song={song} bars={bars} barIdx={bi} engine={engine} transpose={transpose} flats={flats} />}
          {(view === 'guitar' || view === 'bass') && <TabView song={song} bars={bars} barIdx={bi} engine={engine} kind={view} jobs={jobs} />}
          {view === 'drums' && <DrumView song={song} bars={bars} barIdx={bi} engine={engine} />}
        </section>

        <Coach song={song} transpose={transpose} onOpenSettings={() => navigate('#/settings')} />
      </div>

      <Transport
        engine={engine}
        duration={a.duration}
        onLoopSection={loopSection}
        loopLabel={loopLabel}
        transpose={transpose}
        setTranspose={setTranspose}
        keyText={keyLabel(a.key, transpose)}
      />
    </>
  );
}

function JobChip({ label, job, done }: { label: string; job: ReturnType<typeof useJobs>['notes']; done: boolean }) {
  if (done && job.state !== 'running' && job.state !== 'queued') return <span className="chip"><Icon name="check" size={13} /> {label}</span>;
  if (job.state === 'running' || job.state === 'queued')
    return <span className="chip lime" role="status">{label} · {job.progress != null ? `${Math.round(job.progress * 100)}%` : job.state === 'queued' ? 'waiting' : 'working'}</span>;
  if (job.state === 'error') return <span className="chip warn" title={job.error}>{label} failed</span>;
  return null;
}
