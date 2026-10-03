import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { canCaptureTab, fetchTitle, parseLink, recordMic, recordTab, type LinkInfo, type Recorder } from '../lib/capture/sources';
import { fmtTime } from '../lib/music/theory';
import { scanBlob, titleFromFile } from '../lib/scan';
import { useSettings } from '../lib/store/settings';
import { useLibrary } from '../lib/store/library';
import { navigate } from '../router';
import { SongCard } from './Library';
import type { Song } from '../lib/types';

type Mode = 'file' | 'link' | 'mic' | 'tab';

const STEPS = ['Opening the audio', 'Listening to the rhythm', 'Finding the tempo', 'Tracking the beat', 'Reading the harmony', 'Naming the chords', 'Finding the key', 'Mapping the song structure', 'Transcribing the drums'];

export function Home() {
  const [mode, setMode] = useState<Mode>('file');
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const lib = useLibrary();
  const settings = useSettings();

  const scan = async (blob: Blob, title: string, source: Song['source']) => {
    setError('');
    setBusy({ p: 0, label: 'Opening the audio' });
    try {
      const id = await scanBlob(blob, { title, source }, (p, label) => setBusy({ p, label }));
      navigate(`#/song/${id}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBusy(null);
    }
  };

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>Chords · tabs · drums · lyrics · tuner</p>
      <h1 className="hero-title">What do you want to play today?</h1>
      <p className="hero-sub">Drop in a song and get the key, tempo, live chords, guitar and bass tabs, a drum grid and synced lyrics. Everything runs in your browser.</p>

      <div className="grid">
        <section className="card span-8" aria-labelledby="scan-t">
          <div className="card-head" style={{ flexWrap: 'wrap' }}>
            <span className="card-icon"><Icon name="spark" /></span>
            <h2 className="card-title" id="scan-t">Scan a song</h2>
            <div className="tools seg" role="tablist" aria-label="Source">
              {([['file', 'Upload'], ['link', 'Paste a link'], ['mic', 'Record'], ['tab', 'Capture a tab']] as [Mode, string][]).map(([m, l]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} aria-pressed={mode === m} onClick={() => !busy && setMode(m)}>{l}</button>
              ))}
            </div>
          </div>

          {busy ? (
            <Progress p={busy.p} label={busy.label} />
          ) : (
            <>
              {mode === 'file' && <UploadPane onFile={(f) => scan(f, titleFromFile(f.name), { type: 'file', fileName: f.name })} />}
              {mode === 'link' && <LinkPane onDone={(b, title, info) => scan(b, title, { type: 'link', url: info.url, platform: info.platform })} onError={setError} />}
              {mode === 'mic' && <RecordPane kind="mic" onDone={(b) => scan(b, `Recording ${new Date().toLocaleString()}`, { type: 'mic' })} onError={setError} />}
              {mode === 'tab' && <RecordPane kind="tab" onDone={(b) => scan(b, `Tab capture ${new Date().toLocaleString()}`, { type: 'tab' })} onError={setError} />}
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>

        <section className="card lavender span-4" aria-labelledby="how-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="info" /></span>
            <h2 className="card-title" id="how-t">What you get</h2>
          </div>
          <div className="steps" style={{ fontSize: 14 }}>
            {[
              ['Key, tempo & capo tip', 'Instant'],
              ['Live chords + diagrams', 'Instant'],
              ['Chord grid & song parts', 'Instant'],
              ['Drum grid (beta)', 'Instant'],
              ['Guitar & bass tabs', 'AI · ~1 min'],
              ['Separate vocals, drums, bass', 'AI · optional'],
              ['Synced lyrics', settings.groqKey ? 'Groq · ~10 s' : 'AI · a few min'],
            ].map(([a, b]) => (
              <div key={a} className="row" style={{ justifyContent: 'space-between' }}>
                <span><Icon name="check" size={14} /> {a}</span>
                <span className="chip">{b}</span>
              </div>
            ))}
          </div>
          {!settings.groqKey && (
            <a className="pill" href="#/settings" style={{ marginTop: 16 }}>
              <Icon name="spark" size={16} /> Faster lyrics with a free Groq key
            </a>
          )}
        </section>

        <section className="span-12" aria-labelledby="recent-t" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 id="recent-t" style={{ fontWeight: 400, fontSize: 22, margin: 0 }}>Recent scans</h2>
            <a className="pill sm" href="#/library">See all <Icon name="arrowRight" size={14} /></a>
          </div>
          {lib && lib.length ? (
            <div className="lib-grid">
              {lib.slice(0, 4).map((s) => <SongCard key={s.id} song={s} />)}
            </div>
          ) : (
            <div className="card empty">{lib ? 'Your scanned songs will show up here.' : 'Loading…'}</div>
          )}
        </section>
      </div>
    </>
  );
}

function Progress({ p, label }: { p: number; label: string }) {
  const idx = Math.max(0, STEPS.indexOf(label));
  return (
    <div className="steps" role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontWeight: 500 }}>{label}…</strong>
        <span className="muted">{Math.round(p * 100)}%</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, p * 100)}%` }} /></div>
      <div className="steps" style={{ marginTop: 6 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i < idx ? 'done' : i === idx ? 'run' : ''}`}>
            <span className="ic">{i < idx ? <Icon name="check" size={13} /> : i + 1}</span>
            <span>{s}</span>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadPane({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <span className="icon-btn lg lime" aria-hidden="true"><Icon name="upload" size={22} /></span>
      <div style={{ fontSize: 18 }}>Drop a song here</div>
      <div className="note">MP3, WAV, M4A, FLAC, OGG or a video file · up to 15 minutes</div>
      <input ref={input} id="file" type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <label htmlFor="file" className="pill" style={{ cursor: 'pointer' }}>Choose a file</label>
    </div>
  );
}

function useRecorder(onError: (s: string) => void) {
  const [rec, setRec] = useState<Recorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const t0 = Date.now();
    const iv = setInterval(() => {
      setSecs((Date.now() - t0) / 1000);
      setLevel(rec.level());
    }, 100);
    return () => clearInterval(iv);
  }, [rec]);
  useEffect(() => () => rec?.cancel(), [rec]);
  const start = async (kind: 'mic' | 'tab') => {
    try {
      setSecs(0);
      setRec(kind === 'mic' ? await recordMic() : await recordTab());
    } catch (e: any) {
      onError(e?.name === 'NotAllowedError' ? 'Permission was denied. Allow access and try again.' : String(e?.message ?? e));
    }
  };
  const stop = async () => {
    if (!rec) return null;
    const b = await rec.stop();
    setRec(null);
    return b;
  };
  const cancel = () => {
    rec?.cancel();
    setRec(null);
  };
  return { rec, secs, level, start, stop, cancel };
}

function RecordControls({ r, onDone, startLabel, kind }: { r: ReturnType<typeof useRecorder>; onDone: (b: Blob) => void; startLabel: string; kind: 'mic' | 'tab' }) {
  if (!r.rec) {
    return (
      <button type="button" className="pill lime" onClick={() => r.start(kind)} disabled={kind === 'tab' && !canCaptureTab()}>
        <Icon name={kind === 'mic' ? 'mic' : 'tab'} /> {startLabel}
      </button>
    );
  }
  return (
    <div className="steps">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="chip dark"><span className="dot" style={{ color: '#E3F27A' }} /> Recording {fmtTime(r.secs)}</span>
        <span className="note">{r.level < 0.02 ? 'No sound yet — press play' : 'Hearing audio'}</span>
      </div>
      <div className="meter" aria-hidden="true"><i style={{ width: `${r.level * 100}%` }} /></div>
      <div className="row">
        <button
          type="button"
          className="pill is-on"
          disabled={r.secs < 3}
          onClick={async () => {
            const b = await r.stop();
            if (b) onDone(b);
          }}
        >
          <Icon name="check" /> Stop & analyse
        </button>
        <button type="button" className="pill" onClick={r.cancel}>Cancel</button>
      </div>
    </div>
  );
}

function RecordPane({ kind, onDone, onError }: { kind: 'mic' | 'tab'; onDone: (b: Blob) => void; onError: (s: string) => void }) {
  const r = useRecorder(onError);
  return (
    <div className="steps">
      {kind === 'mic' ? (
        <p className="muted" style={{ margin: 0 }}>Play the song on a speaker (or play your instrument) near your microphone. Quality is best with a quiet room.</p>
      ) : (
        <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Open the song in another tab (Spotify, YouTube Music, SoundCloud, Apple Music…).</li>
          <li>Press <strong>Start capture</strong>, pick that tab and turn on <strong>Share tab audio</strong>.</li>
          <li>Play the song from the start, then press <strong>Stop & analyse</strong> at the end.</li>
        </ol>
      )}
      {kind === 'tab' && !canCaptureTab() && <p className="error">Tab capture needs Chrome or Edge on a computer. Use Record instead.</p>}
      <RecordControls r={r} onDone={onDone} startLabel={kind === 'mic' ? 'Start recording' : 'Start capture'} kind={kind} />
      <p className="note">For personal practice only. Audio stays on your device.</p>
    </div>
  );
}

function LinkPane({ onDone, onError }: { onDone: (b: Blob, title: string, info: LinkInfo) => void; onError: (s: string) => void }) {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [title, setTitle] = useState('');
  const r = useRecorder(onError);
  const load = async () => {
    const i = parseLink(url);
    if (!i) {
      onError('Paste a YouTube, Spotify, SoundCloud or Apple Music song link.');
      return;
    }
    onError('');
    setInfo(i);
    setTitle(i.platform + ' song');
    const t = await fetchTitle(i);
    if (t) setTitle(t);
  };
  return (
    <div className="steps">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label htmlFor="link" className="sr-only">Song link</label>
        <input id="link" className="input" style={{ flex: '1 1 280px' }} placeholder="https://youtube.com/watch?v=…  or  open.spotify.com/track/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="pill lime" type="submit"><Icon name="link" /> Load</button>
      </form>
      {info && (
        <>
          <iframe className="embed" title={`${info.platform} player`} src={info.embed} height={info.height} allow="autoplay; encrypted-media; clipboard-write" loading="lazy" />
          <div className="field">
            <label htmlFor="ltitle">Song title</label>
            <input id="ltitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Press <strong>Start scanning</strong> and choose <strong>This tab</strong> with <strong>Share tab audio</strong> on.</li>
            <li>Press play in the player above and let the song run.</li>
            <li>Press <strong>Stop & analyse</strong> when it ends.</li>
          </ol>
          {info.platform === 'Spotify' && <p className="note">Spotify embeds play a 30-second preview unless you're logged in to Spotify in this browser.</p>}
          {!canCaptureTab() && <p className="error">Scanning a link needs Chrome or Edge on a computer. You can still upload a file or record with the mic.</p>}
          <RecordControls r={r} onDone={(b) => onDone(b, title, info)} startLabel="Start scanning" kind="tab" />
          <p className="note">Riffscan never downloads from these platforms — it listens while the official player plays. For personal practice only.</p>
        </>
      )}
    </div>
  );
}
