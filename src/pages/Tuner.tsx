import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { TUNINGS, yin } from '../lib/dsp/yin';
import { noteName } from '../lib/music/theory';
import { updateSettings, useSettings } from '../lib/store/settings';

export function Tuner() {
  const s = useSettings();
  const [tuningId, setTuningId] = useState('guitar');
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState<{ midi: number; cents: number; hz: number } | null>(null);
  const [target, setTarget] = useState<number | null>(null); // string index, null = auto
  const tuning = TUNINGS.find((t) => t.id === tuningId)!;
  const stopRef = useRef<() => void>(() => {});
  const smooth = useRef<number | null>(null);

  const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / s.a4);
  const midiToHz = (m: number) => s.a4 * Math.pow(2, (m - 69) / 12);

  useEffect(() => () => stopRef.current(), []);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let alive = true;
      const loop = () => {
        if (!alive) return;
        an.getFloatTimeDomainData(buf);
        const r = yin(buf, ctx.sampleRate);
        if (r && r.clarity > 0.85 && r.hz > 25 && r.hz < 1400) {
          const m = hzToMidi(r.hz);
          smooth.current = smooth.current == null || Math.abs(smooth.current - m) > 0.8 ? m : smooth.current * 0.75 + m * 0.25;
          const sm = smooth.current;
          setReading({ midi: Math.round(sm), cents: Math.round((sm - Math.round(sm)) * 100), hz: midiToHz(sm) });
        }
        setTimeout(loop, 60);
      };
      loop();
      stopRef.current = () => {
        alive = false;
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
      setOn(true);
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : String(e?.message ?? e));
    }
  };
  const stop = () => {
    stopRef.current();
    setOn(false);
    setReading(null);
  };

  // Closest string (or the chosen one).
  let strIdx: number | null = target;
  if (strIdx == null && reading && tuning.strings.length) {
    let best = 0;
    tuning.strings.forEach((st, i) => {
      if (Math.abs(st.midi - (reading.midi + reading.cents / 100)) < Math.abs(tuning.strings[best].midi - (reading.midi + reading.cents / 100))) best = i;
    });
    strIdx = best;
  }
  const goal = strIdx != null && tuning.strings[strIdx] ? tuning.strings[strIdx].midi : reading?.midi ?? null;
  const offCents = reading && goal != null ? Math.round((reading.midi + reading.cents / 100 - goal) * 100) : 0;
  const clamped = Math.max(-50, Math.min(50, offCents));
  const inTune = reading && Math.abs(offCents) <= 4;
  const angle = (clamped / 50) * 60;

  const playRef = (midi: number) => {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = midiToHz(midi);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 2.3);
    setTimeout(() => ctx.close(), 2500);
  };

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Tuner</h1>
        <div className="head-actions">
          <label htmlFor="tuning" className="sr-only">Tuning</label>
          <select id="tuning" className="input" style={{ width: 'auto' }} value={tuningId} onChange={(e) => { setTuningId(e.target.value); setTarget(null); }}>
            {TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </header>
      <div className="grid">
        <section className={`card span-8 ${inTune ? 'lime' : ''}`} aria-labelledby="tn-t" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <h2 className="sr-only" id="tn-t">Pitch</h2>
          <svg viewBox="0 0 300 170" width="100%" style={{ maxWidth: 440 }} aria-hidden="true">
            {Array.from({ length: 21 }, (_, i) => {
              const a = ((i - 10) / 10) * 60 * (Math.PI / 180);
              const r1 = 130, r2 = i % 5 === 0 ? 112 : 120;
              return <line key={i} x1={150 + r1 * Math.sin(a)} y1={160 - r1 * Math.cos(a)} x2={150 + r2 * Math.sin(a)} y2={160 - r2 * Math.cos(a)} stroke={i === 10 ? '#151815' : '#9aa196'} strokeWidth={i === 10 ? 3 : 1.5} strokeLinecap="round" />;
            })}
            <g style={{ transition: 'transform .12s ease-out', transformOrigin: '150px 160px', transform: `rotate(${reading ? angle : 0}deg)` }}>
              <line x1="150" y1="160" x2="150" y2="44" stroke={inTune ? '#151815' : '#151815'} strokeWidth="3" strokeLinecap="round" />
            </g>
            <circle cx="150" cy="160" r="9" fill="#151815" />
            <text x="40" y="168" fontSize="12" fill="#5f675e">flat</text>
            <text x="245" y="168" fontSize="12" fill="#5f675e">sharp</text>
          </svg>
          <div className="gauge-note" aria-live="polite">
            {reading ? noteName(reading.midi) : '—'}
            <sub>{reading ? Math.floor(reading.midi / 12) - 1 : ''}</sub>
          </div>
          <p style={{ fontSize: 18, margin: '6px 0 18px' }}>
            {!on ? 'Press start and play a string' : !reading ? 'Listening…' : inTune ? 'In tune' : offCents < 0 ? `${-offCents} cents flat — tighten` : `${offCents} cents sharp — loosen`}
            {reading && <span className="muted"> · {reading.hz.toFixed(1)} Hz</span>}
          </p>
          {tuning.strings.length > 0 && (
            <div className="strings" role="group" aria-label="Strings">
              {tuning.strings.map((st, i) => (
                <button
                  key={i}
                  type="button"
                  className={`string-btn ${strIdx === i ? (inTune ? 'ok' : 'on') : ''}`}
                  onClick={() => {
                    setTarget(target === i ? null : i);
                    playRef(st.midi);
                  }}
                  aria-label={`String ${tuning.strings.length - i}: ${st.name}. Plays a reference note.`}
                >
                  {st.name}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            {on ? (
              <button type="button" className="pill" onClick={stop}>Stop</button>
            ) : (
              <button type="button" className="pill lime" onClick={start}><Icon name="mic" /> Start tuner</button>
            )}
          </div>
          {err && <p className="error">{err}</p>}
        </section>
        <section className="card span-4" aria-labelledby="tt-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="info" /></span>
            <h2 className="card-title" id="tt-t">Tips</h2>
          </div>
          <div className="steps" style={{ fontSize: 14 }}>
            <div className="callout">Pluck one string at a time and let it ring. Tap a string button to hear its reference note and lock the tuner to it.</div>
            <div className="callout">Always tune <strong>up</strong> to the note: if you're sharp, go below and come back up — the string holds better.</div>
            <div className="field">
              <label htmlFor="a4">Reference pitch A4 (Hz)</label>
              <input id="a4" className="input" type="number" min={415} max={466} step={1} value={s.a4} onChange={(e) => updateSettings({ a4: Math.max(415, Math.min(466, +e.target.value || 440)) })} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
