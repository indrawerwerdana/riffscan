// Link parsing, official embeds and audio capture (mic or browser tab).

export interface LinkInfo {
  platform: 'YouTube' | 'Spotify' | 'SoundCloud' | 'Apple Music';
  embed: string;
  url: string;
  height: number;
}

export function parseLink(raw: string): LinkInfo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2];
    else id = u.searchParams.get('v') ?? '';
    if (!/^[\w-]{6,}$/.test(id)) return null;
    return { platform: 'YouTube', url: raw, embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, height: 300 };
  }
  if (host === 'open.spotify.com') {
    const m = /\/(track|album|playlist)\/(\w+)/.exec(u.pathname);
    if (!m) return null;
    return { platform: 'Spotify', url: raw, embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: 152 };
  }
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    return {
      platform: 'SoundCloud',
      url: raw,
      embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(raw)}&color=%23141614&auto_play=false&visual=false`,
      height: 166,
    };
  }
  if (host === 'music.apple.com') {
    return { platform: 'Apple Music', url: raw, embed: `https://embed.music.apple.com${u.pathname}${u.search}`, height: 175 };
  }
  return null;
}

/** Try to fetch the track title through the platform's public oEmbed endpoint. */
export async function fetchTitle(info: LinkInfo): Promise<string | null> {
  const endpoints: Record<string, string> = {
    YouTube: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(info.url)}`,
    Spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(info.url)}`,
    SoundCloud: `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(info.url)}`,
  };
  const ep = endpoints[info.platform];
  if (!ep) return null;
  try {
    const r = await fetch(ep);
    if (!r.ok) return null;
    const j = await r.json();
    return j.title ?? null;
  } catch {
    return null;
  }
}

export interface Recorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
  level: () => number;
  stream: MediaStream;
}

function startRecorder(stream: MediaStream, stopTracks: MediaStream): Recorder {
  const audioStream = new MediaStream(stream.getAudioTracks());
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const mimeType = types.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t));
  const rec = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(1000);
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AC();
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(audioStream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const end = () => {
    stopTracks.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  return {
    stream,
    level: () => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.min(1, Math.sqrt(s / buf.length) * 4);
    },
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          end();
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      end();
    },
  };
}

export async function recordMic(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  return startRecorder(stream, stream);
}

/** Capture the audio of a browser tab (Chrome/Edge). The user picks the tab. */
export async function recordTab(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as any,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    systemAudio: 'include',
  } as any);
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('No audio was shared. Pick a tab and turn on "Share tab audio".');
  }
  stream.getVideoTracks().forEach((t) => (t.enabled = false));
  return startRecorder(stream, stream);
}

export const canCaptureTab = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
