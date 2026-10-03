import type { AudioEngine } from '../lib/audio/engine';
import { fmtTime } from '../lib/music/theory';
import { Icon } from './Icon';

const SPEEDS = [0.5, 0.75, 1, 1.25];

export function Transport({ engine, duration, onLoopSection, loopLabel, transpose, setTranspose, keyText }: {
  engine: AudioEngine;
  duration: number;
  onLoopSection: () => void;
  loopLabel: string;
  transpose: number;
  setTranspose: (n: number) => void;
  keyText: string;
}) {
  const t = engine.time;
  return (
    <div className="transport" role="region" aria-label="Playback controls">
      <div className="group">
        <button type="button" className="icon-btn" onClick={() => engine.seek(t - 5)} aria-label="Back 5 seconds"><Icon name="back5" /></button>
        <button type="button" className="icon-btn lg dark" onClick={() => engine.toggle()} aria-label={engine.playing ? 'Pause' : 'Play'}>
          <Icon name={engine.playing ? 'pause' : 'play'} size={22} />
        </button>
        <button type="button" className="icon-btn" onClick={() => engine.seek(t + 5)} aria-label="Forward 5 seconds"><Icon name="fwd5" /></button>
      </div>
      <span className="time">{fmtTime(t)} <span className="muted">/ {fmtTime(duration)}</span></span>
      <label className="sr-only" htmlFor="scrub">Position</label>
      <input id="scrub" className="scrub" type="range" min={0} max={duration || 1} step={0.1} value={Math.min(t, duration)} onChange={(e) => engine.seek(+e.target.value)} />

      <div className="seg" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button key={s} type="button" aria-pressed={Math.abs(engine.rate - s) < 0.01} onClick={() => engine.setRate(s)}>{s}×</button>
        ))}
      </div>

      <button type="button" className={`pill sm ${engine.loop ? 'is-on' : ''}`} onClick={onLoopSection} aria-pressed={!!engine.loop}>
        <Icon name="loop" /> {engine.loop ? loopLabel : 'Loop part'}
      </button>

      <div className="group" role="group" aria-label="Transpose chords">
        <button type="button" className="icon-btn sm" onClick={() => setTranspose(transpose - 1)} aria-label="Transpose down">−</button>
        <span style={{ fontSize: 13, minWidth: 78, textAlign: 'center', lineHeight: 1.1 }}>
          {keyText}
          <br />
          <span className="t-label">{transpose === 0 ? 'original key' : `${transpose > 0 ? '+' : ''}${transpose} semitones`}</span>
        </span>
        <button type="button" className="icon-btn sm" onClick={() => setTranspose(transpose + 1)} aria-label="Transpose up">+</button>
      </div>

      <button type="button" className="icon-btn hide-sm" aria-pressed={engine.metronome} onClick={() => engine.setMetronome(!engine.metronome)} aria-label="Metronome click" title="Metronome click">
        <Icon name="metronome" />
      </button>
      <button type="button" className="icon-btn hide-sm" aria-pressed={engine.vocalsReduced} onClick={() => engine.setVocalsReduced(!engine.vocalsReduced)} aria-label="Reduce vocals (karaoke)" title="Reduce vocals (karaoke)">
        <Icon name="vocal" />
      </button>
    </div>
  );
}
