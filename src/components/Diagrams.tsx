import { guitarShape, ukeShape, type Shape } from '../lib/music/shapes';
import { chordPcs, noteName, type Chord } from '../lib/music/theory';

export function FretDiagram({ chord, instrument }: { chord: Chord; instrument: 'guitar' | 'uke' }) {
  const shape: Shape | null = instrument === 'guitar' ? guitarShape(chord) : ukeShape(chord);
  if (!shape) return <div className="empty" style={{ padding: 30 }}>No chord</div>;
  const n = shape.frets.length;
  const names = instrument === 'guitar' ? ['E', 'A', 'D', 'G', 'B', 'E'] : ['G', 'C', 'E', 'A'];
  const W = instrument === 'guitar' ? 150 : 104;
  const H = 150;
  const top = 26;
  const left = 22;
  const sx = W / (n - 1);
  const sy = H / 5;
  const base = shape.baseFret;
  const nut = base === 1;
  return (
    <svg viewBox={`0 0 ${W + left * 2} ${H + top + 30}`} width="100%" style={{ maxWidth: W + 70, display: 'block', margin: '0 auto' }} role="img" aria-label={`${instrument} chord diagram`}>
      {!nut && (
        <text x={left - 8} y={top + sy / 2 + 4} fontSize="11" textAnchor="end" fill="#5f675e">
          {base}fr
        </text>
      )}
      <rect x={left} y={top - (nut ? 5 : 1)} width={W} height={nut ? 5 : 1.5} rx="1.5" fill="#151815" />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={'f' + i} x1={left} x2={left + W} y1={top + (i + 1) * sy} y2={top + (i + 1) * sy} stroke="#9aa196" strokeWidth="1.2" />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <line key={'s' + i} x1={left + i * sx} x2={left + i * sx} y1={top} y2={top + H} stroke="#151815" strokeWidth={1 + (n - i) * 0.12} />
      ))}
      {shape.barre && (() => {
        const idx = shape.frets.map((f, i) => (f === shape.barre ? i : -1)).filter((i) => i >= 0);
        const a = idx[0], b = idx[idx.length - 1];
        return <rect x={left + a * sx - 10} y={top + (shape.barre - base + 0.5) * sy - 9} width={(b - a) * sx + 20} height={18} rx={9} fill="#151815" />;
      })()}
      {shape.frets.map((f, i) => {
        const x = left + i * sx;
        if (f < 0) return <text key={i} x={x} y={top - 10} textAnchor="middle" fontSize="12" fill="#5f675e">×</text>;
        if (f === 0) return <circle key={i} cx={x} cy={top - 14} r={4.5} fill="none" stroke="#151815" strokeWidth="1.4" />;
        if (shape.barre && f === shape.barre) return null;
        const y = top + (f - base + 0.5) * sy;
        return <circle key={i} cx={x} cy={y} r={9.5} fill="#E3F27A" stroke="#151815" strokeWidth="1.6" />;
      })}
      {names.map((nm, i) => (
        <text key={'n' + i} x={left + i * sx} y={top + H + 20} textAnchor="middle" fontSize="11" fill="#5f675e">
          {nm}
        </text>
      ))}
    </svg>
  );
}

export function PianoDiagram({ chord, flats }: { chord: Chord; flats: boolean }) {
  const pcs = chordPcs(chord);
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
  const ww = 22, wh = 110, octaves = 2;
  const W = ww * 7 * octaves;
  return (
    <svg viewBox={`0 0 ${W + 2} ${wh + 2}`} width="100%" style={{ maxWidth: 360, display: 'block', margin: '0 auto' }} role="img" aria-label="Piano chord diagram">
      {Array.from({ length: octaves }).flatMap((_, o) =>
        whites.map((pc, i) => {
          const on = pcs.includes(pc);
          const x = 1 + (o * 7 + i) * ww;
          return (
            <g key={`w${o}${i}`}>
              <rect x={x} y={1} width={ww} height={wh} rx={4} fill={on ? '#E3F27A' : '#fff'} stroke="#151815" strokeWidth="1.2" />
              {on && <text x={x + ww / 2} y={wh - 8} textAnchor="middle" fontSize="10" fontWeight="600">{noteName(pc, flats)}</text>}
            </g>
          );
        }),
      )}
      {Array.from({ length: octaves }).flatMap((_, o) =>
        blacks.map(([pc, wi]) => {
          const on = pcs.includes(pc);
          const x = 1 + (o * 7 + wi + 1) * ww - 7;
          return <rect key={`b${o}${pc}`} x={x} y={1} width={14} height={wh * 0.6} rx={3} fill={on ? '#C9DD3C' : '#151815'} stroke="#151815" />;
        }),
      )}
    </svg>
  );
}
