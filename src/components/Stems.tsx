import { useEffect, useMemo, useState } from 'react';
import type { AudioEngine } from '../lib/audio/engine';
import { runStems, type SongJobs } from '../lib/jobs';
import { hasWebGPU } from '../lib/stems/separate';
import { fmtTime } from '../lib/music/theory';
import { deleteStems } from '../lib/store/library';
import type { Song, StemName } from '../lib/types';
import { Icon } from './Icon';

const LABEL: Record<StemName, string> = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Guitar · keys · other' };
const ICON: Record<StemName, string> = { vocals: 'mic', drums: 'drum', bass: 'wave', other: 'guitar' };

function MiniWave({ peaks, t, duration, uid }: { peaks: number[]; t: number; duration: number; uid: string }) {
  const d = useMemo(() => {
    const W = 1000, H = 40, mid = H / 2;
    let p = `M0 ${mid}`;
    peaks.forEach((v, i) => (p += ` L${((i / (peaks.length - 1)) * W).toFixed(1)} ${(mid - v * mid * 0.95).toFixed(1)}`));
    for (let i = peaks.length - 1; i >= 0; i--) p += ` L${((i / (peaks.length - 1)) * W).toFixed(1)} ${(mid + peaks[i] * mid * 0.95).toFixed(1)}`;
    return p + ' Z';
  }, [peaks]);
  const x = duration ? (t / duration) * 1000 : 0;
  return (
    <svg viewBox="0 0 1000 40" preserveAspectRatio="none" style={{ width: '100%', height: 40, display: 'block' }} aria-hidden="true">
      <defs>
        <clipPath id={`played-${uid}`}><rect x="0" y="0" width={x} height="40" /></clipPath>
      </defs>
      <path d={d} fill="#b9c0b3" />
      <path d={d} fill="#151815" fillOpacity="0.55" clipPath={`url(#played-${uid})`} />
      <line x1={x} x2={x} y1="0" y2="40" stroke="#151815" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ETA({ s }: { s?: number | null }) {
  if (s == null) return null;
  return <span className="muted"> · about {s > 90 ? `${Math.round(s / 60)} min` : `${s} s`} left</span>;
}

export function StemsCard({ song, engine, jobs }: { song: Song; engine: AudioEngine; jobs: SongJobs }) {
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    hasWebGPU().then(setGpu);
  }, []);
  const job = jobs.stems;
  const running = job.state === 'running' || job.state === 'queued';
  const est = gpu ? Math.max(20, Math.round(song.duration * 0.45)) : Math.round(song.duration * 5);

  if (!song.stems) {
    return (
      <section className="card span-12" aria-labelledby="stems-t">
        <div className="card-head">
          <span className="card-icon"><Icon name="grid" /></span>
          <div>
            <h2 className="card-title" id="stems-t">Separate the instruments</h2>
            <p className="card-sub">AI splits the song into vocals, drums, bass and other — then mute or solo any part</p>
          </div>
        </div>
        {running ? (
          <div className="steps" role="status">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{job.label}<ETA s={job.eta} /></span>
              <span className="muted">{job.progress != null ? `${Math.round(job.progress * 100)}%` : ''}</span>
            </div>
            <div className="bar-track"><div className={`bar-fill ${job.progress == null ? 'hatch' : ''}`} style={{ width: `${job.progress == null ? 100 : Math.max(3, job.progress * 100)}%` }} /></div>
            <p className="note" style={{ margin: 0 }}>Keep this tab open. You can keep practising while it works.</p>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li>Runs Demucs v4 on your device — the audio never leaves your computer.</li>
              <li>First time downloads a ~170 MB model, then it's cached.</li>
              <li>
                {gpu === null ? 'Checking your GPU…' : gpu ? `Your browser has WebGPU · about ${fmtTime(est)} for this song.` : `No WebGPU in this browser · could take ${Math.round(est / 60)}+ minutes. Chrome or Edge on a laptop is much faster.`}
              </li>
              <li>Afterwards, chords, drums, tabs and lyrics are re-read from the isolated parts.</li>
            </ul>
            <div className="steps" style={{ alignItems: 'flex-end' }}>
              {job.state === 'error' && <p className="error" style={{ margin: 0, maxWidth: 420 }}>{job.error}</p>}
              <button type="button" className="pill lime" onClick={() => runStems(song.id)}>
                <Icon name="spark" /> {job.state === 'error' ? 'Try again' : 'Separate instruments'}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const stems = engine.stems ?? [];
  const reanalysing = running;
  return (
    <section className="card span-12" aria-labelledby="stems-t">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <span className="card-icon"><Icon name="grid" /></span>
        <div>
          <h2 className="card-title" id="stems-t">Instruments</h2>
          <p className="card-sub">Mute a part and play it yourself · S = solo · {reanalysing ? job.label : `separated in ${Math.round(song.stems.seconds)} s`}</p>
        </div>
        <div className="tools">
          <div className="seg" role="group" aria-label="Playback source">
            <button type="button" aria-pressed={engine.mode === 'stems'} onClick={() => engine.setMode('stems')}>Stems</button>
            <button type="button" aria-pressed={engine.mode === 'mix'} onClick={() => engine.setMode('mix')}>Original</button>
          </div>
        </div>
      </div>
      <div className="steps" style={{ gap: 8, opacity: engine.mode === 'stems' ? 1 : 0.55 }}>
        {stems.map((s) => {
          const name = s.name as StemName;
          const anySolo = stems.some((x) => x.solo);
          const audible = !s.muted && (!anySolo || s.solo);
          return (
            <div key={name} className="stem-row">
              <div className="stem-name">
                <span className="card-icon" style={{ width: 28, height: 28 }}><Icon name={ICON[name]} size={14} /></span>
                <span>{LABEL[name]}</span>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <button type="button" className="icon-btn sm" aria-pressed={s.muted} aria-label={`Mute ${LABEL[name]}`} onClick={() => engine.setStem(name, { muted: !s.muted })}>M</button>
                <button type="button" className={`icon-btn sm ${s.solo ? 'lime' : ''}`} aria-pressed={s.solo} aria-label={`Solo ${LABEL[name]}`} onClick={() => engine.setStem(name, { solo: !s.solo })} style={s.solo ? { background: 'var(--lime)', borderColor: 'var(--ink)', color: 'var(--ink)' } : undefined}>S</button>
                <label className="sr-only" htmlFor={`vol-${name}`}>{LABEL[name]} volume</label>
                <input id={`vol-${name}`} type="range" min={0} max={1.5} step={0.01} value={s.volume} onChange={(e) => engine.setStem(name, { volume: +e.target.value })} style={{ width: 90, accentColor: 'var(--ink)' }} />
              </div>
              <div style={{ opacity: audible ? 1 : 0.35, minWidth: 0 }}>
                <MiniWave uid={name} peaks={song.stems!.peaks[name] ?? []} t={engine.time} duration={song.duration} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <span className="note">AI separation from Demucs v4 (HTDemucs). Some bleed between parts is normal.</span>
        <button type="button" className="pill sm ghost" onClick={async () => { if (confirm('Delete the separated stems for this song? You can separate again later.')) { engine.setStems(null); await deleteStems(song.id); } }}>
          <Icon name="trash" size={14} /> Remove stems
        </button>
      </div>
    </section>
  );
}
