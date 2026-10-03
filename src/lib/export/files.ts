import type { Song } from '../types';
import { chordPcs } from '../music/theory';

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'song';

/** MIDI file with the transcribed notes and a block-chord track. */
export async function exportMidi(song: Song, transpose: number) {
  const { Midi } = await import('@tonejs/midi');
  const midi = new Midi();
  midi.header.setTempo(song.analysis.bpm);
  midi.header.name = song.title;
  if (song.notes?.length) {
    const t = midi.addTrack();
    t.name = 'Transcribed notes';
    for (const n of song.notes) t.addNote({ midi: n.p + transpose, time: n.t, duration: Math.max(0.05, n.d), velocity: Math.min(1, 0.3 + n.a) });
  }
  const c = midi.addTrack();
  c.name = 'Chords';
  for (const seg of song.analysis.chords) {
    if (seg.root < 0) continue;
    const pcs = chordPcs({ root: seg.root + transpose, quality: seg.quality });
    pcs.forEach((pc, i) => {
      let m = 48 + pc;
      if (i > 0 && m < 48 + pcs[0]) m += 12;
      c.addNote({ midi: m, time: seg.start, duration: Math.max(0.1, seg.end - seg.start), velocity: 0.55 });
    });
    c.addNote({ midi: 36 + pcs[0], time: seg.start, duration: Math.max(0.1, seg.end - seg.start), velocity: 0.6 });
  }
  download(`${safeName(song.title)}.mid`, new Blob([midi.toArray() as BlobPart], { type: 'audio/midi' }));
}
