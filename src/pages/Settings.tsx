import { useEffect, useState } from 'react';
import { hasWebGPU } from '../lib/stems/separate';
import { Icon } from '../components/Icon';
import { testGroqKey } from '../lib/ai/coach';
import { DEFAULT_SETTINGS, updateSettings, useSettings } from '../lib/store/settings';

const LANGS: [string, string][] = [
  ['auto', 'Detect automatically'], ['id', 'Indonesian'], ['en', 'English'], ['ms', 'Malay'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['zh', 'Chinese'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['fr', 'French'], ['de', 'German'], ['tl', 'Tagalog'], ['th', 'Thai'], ['vi', 'Vietnamese'],
];

export function SettingsPage() {
  const s = useSettings();
  const [key, setKey] = useState(s.groqKey);
  const [status, setStatus] = useState<'' | 'checking' | 'ok' | 'bad'>('');
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    hasWebGPU().then(setGpu);
  }, []);

  const saveKey = async () => {
    const k = key.trim();
    updateSettings({ groqKey: k });
    if (!k) return setStatus('');
    setStatus('checking');
    try {
      setStatus((await testGroqKey(k)) ? 'ok' : 'bad');
    } catch {
      setStatus('bad');
    }
  };

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
      </header>
      <div className="grid">
        <section className="card span-7" aria-labelledby="groq-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="spark" /></span>
            <div>
              <h2 className="card-title" id="groq-t">Groq (optional)</h2>
              <p className="card-sub">Faster, more accurate lyrics and the AI practice coach</p>
            </div>
          </div>
          <div className="steps">
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li>Create a free account at <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a>.</li>
              <li>Open <strong>API Keys</strong> → <strong>Create API key</strong>, then copy it.</li>
              <li>Paste it below and press Save.</li>
            </ol>
            <div className="field">
              <label htmlFor="gk">Groq API key</label>
              <div className="row">
                <input id="gk" className="input" type="password" autoComplete="off" spellCheck={false} placeholder="gsk_…" value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: '1 1 260px' }} />
                <button type="button" className="pill lime" onClick={saveKey}>Save</button>
                {s.groqKey && <button type="button" className="pill" onClick={() => { setKey(''); updateSettings({ groqKey: '' }); setStatus(''); }}>Remove</button>}
              </div>
              {status === 'checking' && <span className="note">Checking the key…</span>}
              {status === 'ok' && <span className="note"><Icon name="check" size={13} /> Key works.</span>}
              {status === 'bad' && <span className="error">Groq didn't accept this key (or the browser blocked the request). Check it and try again.</span>}
            </div>
            <p className="note" style={{ margin: 0 }}>
              The key is stored only in this browser. When Groq is used, the song's audio (for lyrics) or the song summary (for the coach) is sent to Groq. Everything else runs on your device.
            </p>
            <div className="row">
              <div className="field" style={{ flex: '1 1 200px' }}>
                <label htmlFor="gwm">Groq speech model</label>
                <input id="gwm" className="input" value={s.groqWhisperModel} onChange={(e) => updateSettings({ groqWhisperModel: e.target.value.trim() || DEFAULT_SETTINGS.groqWhisperModel })} />
              </div>
              <div className="field" style={{ flex: '1 1 200px' }}>
                <label htmlFor="gcm">Groq chat model</label>
                <input id="gcm" className="input" value={s.groqChatModel} onChange={(e) => updateSettings({ groqChatModel: e.target.value.trim() || DEFAULT_SETTINGS.groqChatModel })} />
              </div>
            </div>
          </div>
        </section>

        <section className="card span-5" aria-labelledby="ly-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="lyrics" /></span>
            <h2 className="card-title" id="ly-t">Transcription</h2>
          </div>
          <div className="steps">
            <div className="field">
              <label htmlFor="eng">Lyrics engine</label>
              <select id="eng" className="input" value={s.lyricsEngine} onChange={(e) => updateSettings({ lyricsEngine: e.target.value as any })}>
                <option value="auto">Automatic (Groq if connected, else in the browser)</option>
                <option value="groq">Groq Whisper only</option>
                <option value="browser">In the browser only (private)</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="lang">Song language</label>
              <select id="lang" className="input" value={s.language} onChange={(e) => updateSettings({ language: e.target.value })}>
                {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bwm">In-browser Whisper model</label>
              <select id="bwm" className="input" value={s.browserWhisperModel} onChange={(e) => updateSettings({ browserWhisperModel: e.target.value })}>
                <option value="onnx-community/whisper-base_timestamped">Base · word-by-word timing (recommended)</option>
                <option value="Xenova/whisper-tiny">Tiny · fastest, line-by-line timing</option>
                <option value="Xenova/whisper-small">Small · most accurate, slower, line-by-line timing</option>
              </select>
              <span className="note">Downloaded once from Hugging Face, then cached.</span>
            </div>
            <label className="row" style={{ fontSize: 14 }}>
              <input type="checkbox" checked={s.autoNotes} onChange={(e) => updateSettings({ autoNotes: e.target.checked })} />
              Make guitar & bass tabs automatically after each scan
            </label>
          </div>
        </section>

        <section className="card span-12" aria-labelledby="st-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="grid" /></span>
            <div>
              <h2 className="card-title" id="st-t">Instrument separation</h2>
              <p className="card-sub">Demucs v4 running on your device · {gpu === null ? 'checking GPU…' : gpu ? 'WebGPU available (fast)' : 'no WebGPU — separation will be slow'}</p>
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
            <label className="row" style={{ fontSize: 14, flex: '1 1 280px' }}>
              <input type="checkbox" checked={s.autoStems} onChange={(e) => updateSettings({ autoStems: e.target.checked })} />
              Separate instruments automatically after each scan
            </label>
            <div className="field" style={{ flex: '1 1 320px' }}>
              <label htmlFor="smu">Model file address</label>
              <input id="smu" className="input" value={s.stemModelUrl} onChange={(e) => updateSettings({ stemModelUrl: e.target.value.trim() || DEFAULT_SETTINGS.stemModelUrl })} />
              <span className="note">Default: the copy hosted with this site. Weights by Meta (Demucs), for personal and research use.</span>
            </div>
          </div>
        </section>

        <section className="card span-12" aria-labelledby="ab-t">
          <div className="card-head">
            <span className="card-icon"><Icon name="info" /></span>
            <h2 className="card-title" id="ab-t">Open-source engines used</h2>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="chip">Chords, key, tempo, drums — Riffscan DSP (on device)</span>
            <span className="chip">Stems — Demucs v4 via demucs-js + ONNX Runtime Web (on device)</span>
            <span className="chip">Notes → tabs — Spotify Basic Pitch (on device)</span>
            <span className="chip">Lyrics — OpenAI Whisper via transformers.js (on device) or Groq</span>
            <span className="chip">Coach — open-weight LLM on Groq</span>
          </div>
        </section>
      </div>
    </>
  );
}
