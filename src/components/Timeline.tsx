import { useMemo, useRef, useState } from 'react';
import type { AudioEngine } from '../lib/audio/engine';
import { chordLabel, fmtTime } from '../lib/music/theory';
import type { Analysis } from '../lib/types';

interface Props {
  a: Analysis;
  engine: AudioEngine;
  chordIdx: number;
  sectionIdx: number;
  transpose: number;
  flats: boolean;
}

export function Timeline({ a, engine, chordIdx, sectionIdx, transpose, flats }: Props) {
  const D = a.duration || 1;
  const t = engine.time;
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; t0: number; t1: number } | null>(null);

  const path = useMemo(() => {
    const p = a.peaks;
    const W = 1000, H = 96, mid = H / 2;
    let d = `M0 ${mid}`;
    p.forEach((v, i) => (d += ` L${((i / (p.length - 1)) * W).toFixed(1)} ${(mid - v * mid * 0.95).toFixed(1)}`));
    for (let i = p.length - 1; i >= 0; i--) d += ` L${((i / (p.length - 1)) * W).toFixed(1)} ${(mid + p[i] * mid * 0.95).toFixed(1)}`;
    return d + ' Z';
  }, [a.peaks]);

  const toTime = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(D, ((clientX - r.left) / r.width) * D));
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const tt = toTime(e.clientX);
    setDrag({ x0: e.clientX, t0: tt, t1: tt });
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, t1: toTime(e.clientX) });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) < 6) engine.seek(drag.t0);
    else {
      const s = Math.min(drag.t0, drag.t1), en = Math.max(drag.t0, drag.t1);
      engine.setLoop({ start: s, end: en });
      engine.seek(s);
    }
    setDrag(null);
  };

  const loop = drag && Math.abs(drag.t1 - drag.t0) > 0.2 ? { start: Math.min(drag.t0, drag.t1), end: Math.max(drag.t0, drag.t1) } : engine.loop;
  const pct = (x: number) => `${(x / D) * 100}%`;

  return (
    <div>
      <div className="lane-sections" role="group" aria-label="Song sections">
        {a.sections.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`${i === sectionIdx ? 'on' : ''} ${engine.loop && Math.abs(engine.loop.start - s.start) < 0.05 && Math.abs(engine.loop.end - s.end) < 0.05 ? 'loop' : ''}`}
            style={{ width: pct(s.end - s.start) }}
            onClick={() => engine.seek(s.start + 0.01)}
            title={`${s.label} · ${fmtTime(s.start)}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="timeline"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        role="slider"
        aria-label="Song position. Click to jump, drag to loop a part."
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={Math.round(t)}
        aria-valuetext={fmtTime(t)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') engine.seek(t + 5);
          if (e.key === 'ArrowLeft') engine.seek(t - 5);
        }}
        style={{ cursor: 'pointer', paddingTop: 16 }}
      >
        <svg className="wave" viewBox="0 0 1000 96" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="hatchP" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="#c9d0c4" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="#151815" strokeOpacity=".35" strokeWidth="2" />
            </pattern>
            <clipPath id="played">
              <rect x="0" y="0" width={(t / D) * 1000} height="96" />
            </clipPath>
          </defs>
          <path d={path} fill="#d3d9cf" />
          <path d={path} fill="url(#hatchP)" clipPath="url(#played)" />
        </svg>
        {loop && <div className="loop-region" style={{ left: pct(loop.start), width: pct(loop.end - loop.start), top: 16 }} />}
        <div className="playhead" style={{ left: pct(t), top: 16 }} />
        <div className="playhead-tag" style={{ left: pct(t) }}>{fmtTime(t)}</div>
      </div>
      <div className="scroll-x">
        <div className="lane-chords" style={{ minWidth: Math.max(600, a.chords.length * 18) }} role="group" aria-label="Chords">
          {a.chords.map((c, i) => (
            <button
              key={i}
              type="button"
              className={`${i === chordIdx ? 'on' : ''} ${c.root < 0 ? 'nc' : ''}`}
              style={{ width: pct(c.end - c.start) }}
              onClick={() => engine.seek(c.start + 0.01)}
              title={`${chordLabel(c, transpose, flats)} · ${fmtTime(c.start)}`}
            >
              {c.root < 0 ? '' : chordLabel(c, transpose, flats)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
