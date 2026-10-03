import { writeFileSync } from 'node:fs';
import { analyze } from '../src/lib/dsp/analyze';
import { chordLabel, keyLabel } from '../src/lib/music/theory';
import { synthSong, toWav } from './synth';

const sr = 22050;
const cases = [
  { name: 'em-pop', bpm: 100, tuning: 0, bars: ['Em', 'Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D', 'Am', 'C', 'G', 'D', 'G', 'D', 'Em', 'C', 'G', 'D', 'C', 'C', 'Em', 'C', 'G', 'D', 'Em'] },
  { name: 'bb-ballad', bpm: 76, tuning: 18, bars: ['Bb', 'Gm', 'Eb', 'F', 'Bb', 'Gm', 'Eb', 'F', 'Cm', 'F', 'Bb', 'Bb', 'Eb', 'F', 'Gm', 'Eb', 'Bb', 'F', 'Bb', 'Bb'] },
  { name: 'a-rock', bpm: 132, tuning: -12, bars: ['A', 'A', 'D', 'E', 'A', 'D', 'E', 'A', 'F#m', 'D', 'A', 'E', 'F#m', 'D', 'A', 'E', 'A', 'D', 'E', 'A', 'A', 'D', 'E', 'A'] },
  { name: 'rich-jazzpop', bpm: 92, tuning: 0, bars: ['Cmaj7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'G7', 'Cmaj7', 'Fmaj7', 'Fmaj7', 'Dsus4', 'D', 'Gsus4', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'C'] },
  { name: 'slash-pop', bpm: 104, tuning: 0, bars: ['G', 'G', 'D/F#', 'Em', 'C', 'G/B', 'Am', 'D', 'G', 'D/F#', 'Em', 'C', 'G/B', 'Am', 'D', 'G', 'C/E', 'D/F#', 'G', 'G', 'Bdim', 'Em', 'C', 'D', 'G'] },
];

const norm = (s: string) => s.replace('Bb', 'A#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Db', 'C#');
const fam = (s: string) => {
  const m = /^([A-G][#b]?)(maj7|m7|sus2|sus4|dim|aug|7|m)?/.exec(s)!;
  const minor = m[2] === 'm' || m[2] === 'm7' || m[2] === 'dim';
  return norm(m[1]) + (minor ? 'm' : '');
};

for (const c of cases) {
  const x = synthSong({ sr, bpm: c.bpm, bars: c.bars, tuningCents: c.tuning });
  if (c.name === 'em-pop') writeFileSync('scripts/test-song.wav', toWav(x, sr));
  const t0 = performance.now();
  const a = analyze(x, sr);
  const ms = performance.now() - t0;
  const beat = 60 / c.bpm;
  // Chord accuracy: sample the middle of each half bar.
  let ok = 0, okFam = 0, n = 0;
  const misses: string[] = [];
  c.bars.forEach((name, b) => {
    for (const off of [1, 3]) {
      const t = (b * 4 + off) * beat + 0.1;
      const seg = a.chords.find((s) => t >= s.start && t < s.end);
      n++;
      const got = seg ? chordLabel(seg) : '-';
      if (got === norm(name)) ok++;
      else if (off === 1) misses.push(`${name}→${got}`);
      if (seg && fam(got) === fam(name)) okFam++;
    }
  });
  const firstDown = a.beats[a.downbeat];
  const barPhaseErr = ((firstDown / beat) % 4 + 4) % 4;
  console.log(`\n[${c.name}] ${ms.toFixed(0)} ms`);
  console.log(`  bpm ${a.bpm} (true ${c.bpm}) tuning ${a.tuningCents}c (true ${c.tuning}) key ${keyLabel(a.key)} conf ${a.key.confidence.toFixed(2)}`);
  console.log(`  chord accuracy exact ${(100 * ok / n).toFixed(0)}% · family ${(100 * okFam / n).toFixed(0)}% · ${a.chords.length} segments · downbeat phase err ${barPhaseErr.toFixed(2)} beats`);
  if (misses.length) console.log(`  misses: ${misses.slice(0, 12).join(', ')}`);
  console.log(`  sections: ${a.sections.map((s) => `${s.label}@${s.start.toFixed(1)}`).join(', ')}`);
  console.log(`  drums: ${a.drums.bars.length} bars, conf ${a.drums.confidence}; bar5 kick ${a.drums.bars[5]?.kick.join('')} snare ${a.drums.bars[5]?.snare.join('')} hat ${a.drums.bars[5]?.hat.join('')}`);
  console.log(`  chords: ${a.chords.slice(0, 14).map((s) => chordLabel(s)).join(' ')}`);
}
