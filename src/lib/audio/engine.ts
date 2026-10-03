// Playback engine: original mix or separated stems (mute / solo / volume per stem),
// speed with pitch preserved, A–B loop, vocal reduction for the mix, metronome.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { StemName } from '../types';

export interface Track {
  name: string;
  el: HTMLAudioElement;
  url: string;
  src?: MediaElementAudioSourceNode;
  gain?: GainNode;
  volume: number;
  muted: boolean;
  solo: boolean;
}

function makeTrack(name: string, blob: Blob): Track {
  const url = URL.createObjectURL(blob);
  const el = new Audio();
  el.src = url;
  el.preload = 'auto';
  (el as any).preservesPitch = true;
  return { name, el, url, volume: 1, muted: false, solo: false };
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master?: GainNode;
  private normal?: GainNode;
  private karaoke?: GainNode;
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastT = 0;
  private rateValue = 1;
  mix: Track;
  stems: Track[] | null = null;
  mode: 'mix' | 'stems' = 'mix';
  beats: number[] = [];
  downbeat = 0;
  loop: { start: number; end: number } | null = null;
  metronome = false;
  vocalsReduced = false;
  volume = 0.9;
  time = 0;
  playing = false;
  duration = 0;

  constructor(blob: Blob) {
    this.mix = makeTrack('mix', blob);
    this.attach(this.mix);
    this.mix.el.addEventListener('loadedmetadata', () => {
      this.duration = this.mix.el.duration;
      this.emit();
    });
  }

  private attach(t: Track) {
    const sync = () => {
      this.playing = !this.leader.paused;
      if (this.playing) this.startLoop();
      this.emit();
    };
    t.el.addEventListener('play', sync);
    t.el.addEventListener('pause', sync);
    t.el.addEventListener('ended', sync);
  }

  get leader(): HTMLAudioElement {
    return this.mode === 'stems' && this.stems ? this.stems[0].el : this.mix.el;
  }
  get active(): Track[] {
    return this.mode === 'stems' && this.stems ? this.stems : [this.mix];
  }

  private graph() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // Mix: normal path + karaoke path (L − R removes centred vocals; low end added back).
    const src = ctx.createMediaElementSource(this.mix.el);
    this.mix.el.volume = 1;
    this.mix.src = src;
    this.normal = ctx.createGain();
    src.connect(this.normal).connect(this.master);
    this.karaoke = ctx.createGain();
    this.karaoke.gain.value = 0;
    const split = ctx.createChannelSplitter(2);
    const inv = ctx.createGain();
    inv.gain.value = -1;
    const side = ctx.createGain();
    src.connect(split);
    split.connect(side, 0);
    split.connect(inv, 1).connect(side);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 160;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.9;
    src.connect(low).connect(lowGain).connect(this.karaoke);
    side.connect(this.karaoke);
    this.karaoke.connect(this.master);
    this.applyVocals();
    if (this.stems) this.stems.forEach((t) => this.connectStem(t));
  }

  private connectStem(t: Track) {
    if (!this.ctx || !this.master || t.src) return;
    t.src = this.ctx.createMediaElementSource(t.el);
    t.el.volume = 1;
    t.gain = this.ctx.createGain();
    t.src.connect(t.gain).connect(this.master);
    this.applyStemGains();
  }

  private applyVocals() {
    if (!this.ctx || !this.normal || !this.karaoke) return;
    const t = this.ctx.currentTime;
    this.normal.gain.setTargetAtTime(this.vocalsReduced ? 0 : 1, t, 0.05);
    this.karaoke.gain.setTargetAtTime(this.vocalsReduced ? 1 : 0, t, 0.05);
  }

  private applyStemGains() {
    if (!this.stems) return;
    const anySolo = this.stems.some((s) => s.solo);
    for (const s of this.stems) {
      const g = s.muted || (anySolo && !s.solo) ? 0 : s.volume;
      if (s.gain && this.ctx) s.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
      else s.el.volume = Math.min(1, g);
    }
  }

  /** Load separated stems; switches to stem playback. */
  setStems(blobs: Record<StemName, Blob> | null) {
    const wasPlaying = this.playing;
    const t = this.leader.currentTime;
    if (this.stems) {
      for (const s of this.stems) {
        s.el.pause();
        s.src?.disconnect();
        URL.revokeObjectURL(s.url);
      }
      this.stems = null;
    }
    if (blobs) {
      const order: StemName[] = ['vocals', 'drums', 'bass', 'other'];
      this.stems = order.filter((n) => blobs[n]).map((n) => makeTrack(n, blobs[n]));
      this.stems.forEach((s) => {
        this.attach(s);
        s.el.playbackRate = this.rateValue;
        s.el.currentTime = t;
        this.connectStem(s);
      });
    }
    this.setMode(blobs ? 'stems' : 'mix', wasPlaying, t);
  }

  setMode(mode: 'mix' | 'stems', resume = this.playing, at = this.leader.currentTime) {
    if (mode === 'stems' && !this.stems) mode = 'mix';
    for (const tr of this.active) tr.el.pause();
    this.mode = mode;
    for (const tr of this.active) {
      tr.el.currentTime = at;
      tr.el.playbackRate = this.rateValue;
    }
    if (resume) this.play().catch(() => {});
    this.emit();
  }

  setStem(name: string, patch: Partial<Pick<Track, 'volume' | 'muted' | 'solo'>>) {
    const s = this.stems?.find((x) => x.name === name);
    if (!s) return;
    Object.assign(s, patch);
    this.applyStemGains();
    this.emit();
  }

  async play() {
    this.graph();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    const at = this.leader.currentTime;
    for (const tr of this.active) if (Math.abs(tr.el.currentTime - at) > 0.02) tr.el.currentTime = at;
    await Promise.all(this.active.map((tr) => tr.el.play()));
  }
  pause() {
    for (const tr of this.active) tr.el.pause();
  }
  toggle() {
    if (this.leader.paused) this.play().catch(() => {});
    else this.pause();
  }
  seek(t: number) {
    const d = this.leader.duration || this.duration || 0;
    const to = Math.max(0, Math.min(d ? d - 0.05 : t, t));
    for (const tr of this.active) tr.el.currentTime = to;
    this.time = to;
    this.lastT = to;
    this.emit();
  }
  setRate(r: number) {
    this.rateValue = r;
    for (const tr of [this.mix, ...(this.stems ?? [])]) tr.el.playbackRate = r;
    this.emit();
  }
  get rate() {
    return this.rateValue;
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
    else this.mix.el.volume = v;
    this.emit();
  }
  setVocalsReduced(on: boolean) {
    this.vocalsReduced = on;
    if (this.mode === 'stems' && this.stems) {
      this.setStem('vocals', { muted: on });
      return;
    }
    this.graph();
    this.applyVocals();
    this.emit();
  }
  setMetronome(on: boolean) {
    this.metronome = on;
    this.graph();
    this.emit();
  }
  setLoop(l: { start: number; end: number } | null) {
    this.loop = l && l.end - l.start > 0.3 ? l : null;
    this.emit();
  }

  private click(accent: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.06);
  }

  private startLoop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const lead = this.leader;
      const t = lead.currentTime;
      if (this.loop && this.playing && t >= this.loop.end) {
        this.seek(this.loop.start);
      } else {
        if (this.metronome && this.playing && t > this.lastT && t - this.lastT < 0.5) {
          for (let i = 0; i < this.beats.length; i++) {
            const b = this.beats[i];
            if (b > this.lastT && b <= t) this.click((((i - this.downbeat) % 4) + 4) % 4 === 0);
            if (b > t) break;
          }
        }
        // Keep stems locked to the leader.
        if (this.mode === 'stems' && this.stems && !lead.paused) {
          for (const s of this.stems) {
            if (s.el === lead) continue;
            if (s.el.paused) s.el.play().catch(() => {});
            if (Math.abs(s.el.currentTime - t) > 0.045) s.el.currentTime = t;
          }
        }
      }
      this.lastT = lead.currentTime;
      this.time = lead.currentTime;
      this.emit();
      if (!lead.paused) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  private snap = 0;
  getSnapshot = () => this.snap;
  private emit() {
    this.snap++;
    this.listeners.forEach((l) => l());
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const tr of [this.mix, ...(this.stems ?? [])]) {
      tr.el.pause();
      tr.el.src = '';
      URL.revokeObjectURL(tr.url);
    }
    this.ctx?.close().catch(() => {});
  }
}

export function useEngine(engine: AudioEngine | null) {
  useSyncExternalStore(engine ? engine.subscribe : () => () => {}, engine ? engine.getSnapshot : () => 0);
  return engine;
}

export function useEngineFor(blob: Blob | null | undefined) {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  useEffect(() => {
    if (!blob) return;
    const e = new AudioEngine(blob);
    setEngine(e);
    return () => e.dispose();
  }, [blob]);
  return engine;
}
