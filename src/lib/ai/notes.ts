// Polyphonic note transcription with Spotify's open-source Basic Pitch model.
// Loaded lazily so the first page load stays small.
import type { NoteEvent } from '../types';

export async function transcribeNotes(samples22k: Float32Array, onProgress: (p: number) => void): Promise<NoteEvent[]> {
  const tf = await import('@tensorflow/tfjs');
  try {
    await tf.setBackend('webgl');
  } catch {
    await tf.setBackend('cpu');
  }
  await tf.ready();
  const bp = await import('@spotify/basic-pitch');
  const model = new bp.BasicPitch(new URL('models/basic-pitch/model.json', document.baseURI).href);
  const frames: number[][] = [];
  const onsets: number[][] = [];
  await model.evaluateModel(
    samples22k,
    (f: number[][], o: number[][]) => {
      for (const r of f) frames.push(r);
      for (const r of o) onsets.push(r);
    },
    (p: number) => onProgress(p * 0.95),
  );
  const raw = bp.noteFramesToTime(bp.outputToNotesPoly(frames, onsets, 0.5, 0.3, 11, true));
  onProgress(1);
  return raw
    .map((n) => ({
      t: Math.round(n.startTimeSeconds * 1000) / 1000,
      d: Math.round(n.durationSeconds * 1000) / 1000,
      p: n.pitchMidi,
      a: Math.round(n.amplitude * 100) / 100,
    }))
    .sort((a, b) => a.t - b.t);
}
