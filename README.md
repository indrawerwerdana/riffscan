# Riffscan — scan any song into chords, tabs, drums and lyrics

Riffscan is a web app for musicians. Give it a song and it shows you how to play it: the key, tempo, live chords that follow the music, chord diagrams for guitar, ukulele and piano, guitar and bass tabs, a drum grid, synced lyrics with the chords above the words, and a tuner.

It runs **in the browser**, so it can be hosted for free on GitHub Pages. You don't need a server, and nobody needs Claude to use it.

> "Riffscan" is a working name. To rename the app, change `APP_NAME` in `src/App.tsx` and the `<title>` in `index.html`.

---

## Features

| Area | What it does | Engine |
| --- | --- | --- |
| Scan | Upload a file, paste a YouTube / Spotify / SoundCloud / Apple Music link, record with the mic, or capture a browser tab | — |
| Song DNA | Key, tempo (BPM), tuning offset, capo suggestion, most-used chords | Riffscan DSP (on device) |
| Live chords | Big "now / next" chord, beat counter, chord timeline you can click | Riffscan DSP |
| Richer chords (v2) | Major, minor, 7, maj7, m7, sus2, sus4, dim, aug and slash chords (D/F#, G/B…), plus a **Simple** toggle that turns everything back into easy triads | Riffscan DSP |
| Chord shapes | Guitar (open, barre and searched voicings for any chord, including slash chords), ukulele, piano; follows transpose and capo | built in |
| **Instrument separation (v2)** | Splits the song into **vocals, drums, bass and other**, with mute / solo / volume for each part (play along with the guitar muted, solo the bass…). Stems can be exported as MP3 | **Demucs v4 (HTDemucs)** via demucs-js + ONNX Runtime Web, on device (WebGPU) |
| Stem-powered re-analysis (v2) | After separation, chords are re-read without vocals and drums, the drum grid comes from the drum stem, tabs come from the bass and "other" stems, and lyrics are transcribed from the isolated vocals | all of the above |
| Song parts | Splits the song into parts (Intro, Part A, Part B…) and lets you loop one | Riffscan DSP |
| Chord grid | Bar-by-bar chord chart | Riffscan DSP |
| Guitar & bass tabs | Notes turned into fret positions, bar by bar | Spotify **Basic Pitch** (open source, on device) |
| Drums (beta) | 16-step kick / snare / hi-hat grid for each bar | Riffscan DSP |
| Lyrics | Word-by-word timing, chords placed above the words, karaoke highlight | **Whisper** — via **Groq** (fast, free key) or **in the browser** (private) |
| Practice coach | Quick tips (scale, diatonic chords, capo), plus AI chat about the song | open-weight LLM on **Groq** |
| Practice tools | 0.5×–1.25× speed without changing pitch, A–B loop (drag on the waveform), metronome click, vocal reduction, transpose | Web Audio |
| Tuner | Guitar (standard, Drop D, half-step down, Open G, DADGAD), bass 4/5, ukulele, violin, chromatic; reference tones; A4 calibration | YIN pitch detection |
| Export | Chord sheet (.txt), print / PDF, MIDI (notes + chords), JSON | — |
| Library | Songs are saved in the browser (IndexedDB) | — |

### Why links work this way
Spotify and Apple Music are DRM-protected, and YouTube's terms don't allow downloading. So Riffscan **never downloads** from these platforms. It shows the official player, and **listens to the tab while it plays** (Chrome / Edge: "Share tab audio"). Use this for personal practice only.

---

## Run it on your computer

You need [Node.js 20+](https://nodejs.org).

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

---

## Put it online with GitHub Pages (free)

> The build downloads the ~174 MB separation model and publishes it with the site. GitHub Pages allows this (the site limit is 1 GB).

1. **Create a repository.** On github.com, click **New repository** and name it (for example `riffscan`). It can be public or private. A private repo needs a paid plan for Pages.
2. **Upload the project.** The easiest way is **GitHub Desktop**: *File → Add local repository* → pick this folder → *Publish repository*.
   Or, from a terminal:
   ```bash
   git init && git add . && git commit -m "Riffscan"
   git branch -M main
   git remote add origin https://github.com/<your-name>/riffscan.git
   git push -u origin main
   ```
   Make sure the hidden `.github` folder is included. Finder hides it, which is why GitHub Desktop or the terminal works better than drag-and-drop.
3. **Turn on Pages.** In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Wait about 2 minutes.** The *Deploy to GitHub Pages* workflow (in the **Actions** tab) builds the site. Your app will be at
   `https://<your-name>.github.io/riffscan/`.

Every push to `main` redeploys automatically.

---

## Groq (optional, recommended)

Without a key, everything still works: lyrics are transcribed by Whisper inside the browser. A free Groq key makes lyrics much faster and more accurate, and turns on the AI coach chat.

1. Sign up at https://console.groq.com, then go to **API Keys → Create API key**.
2. In Riffscan, open **Settings**, paste the key and press **Save**.

The key is stored only in that browser (localStorage). It is never put in the code, so each person who uses your site adds their own key. When Groq is used, the song audio (for lyrics) or a text summary of the song (for the coach) is sent to Groq. Everything else stays on the device.

You can change the Groq model names in Settings if Groq renames or retires a model.

---

## How it works (for your engineer friend)

```
src/
  lib/dsp/analyze.ts      tempo, beat tracking (DP), tuning, chroma → chords (templates + Viterbi),
                          key (Krumhansl + chord evidence), sections (phrase similarity), drums (band onsets)
  lib/dsp/worker.ts       runs the analysis in a Web Worker
  lib/stems/              Demucs separation worker (ONNX Runtime Web + Mediabunny MP3 encoder)
  lib/ai/notes.ts         Basic Pitch (TensorFlow.js) → note events
  lib/ai/lyrics.ts        Groq Whisper (verbose_json + word timestamps) or in-browser Whisper
  lib/ai/whisper.worker.ts transformers.js pipeline (WebGPU if available, else WASM)
  lib/ai/coach.ts         Groq chat completions with the song analysis as context
  lib/music/*             theory (transpose, capo, keys), chord shapes, tabs, chord+lyrics sheet
  lib/audio/engine.ts     playback: speed, loop, vocal reduction (L−R + low end), metronome
  lib/capture/sources.ts  link parsing, official embeds, mic / tab recording
  lib/jobs.ts             background AI jobs (tabs, lyrics) per song
  pages/                  Home (scan), Player, Library, Tuner, Settings
```

- `npm run test:dsp` runs the analyser on five generated test songs (pop, ballad, rock, 7th/sus chords, slash chords) and prints tempo, key, tuning and chord accuracy.
- `scripts/e2e.py` is a Playwright smoke test (upload → player → tabs → lyrics with Groq mocked → coach → tuner).
- `scripts/e2e-v2.py` tests rich chords + Simple mode, then runs **real Demucs separation** in headless Chromium and checks the stem mixer, the re-analysis, the stem tabs and the vocal lyrics.

### Instrument separation — how it works
- The model is Meta's **HTDemucs** (Demucs v4, 4 stems), exported to ONNX by the `demucs` npm package (bakkot/demucs-js, MIT). `npm run build` and `npm run dev` download it once into `public/models/htdemucs.onnx` (~174 MB), so it's **hosted with your site**. Set `SKIP_MODEL=1` to skip that and point *Settings → Model file address* somewhere else instead.
- It runs in a Web Worker with **ONNX Runtime Web**: WebGPU when available (Chrome/Edge/Safari on a laptop — roughly 2–4× faster than real time), otherwise WebAssembly (works, but several times slower than real time).
- Songs are processed in 45-second windows with overlap, so memory stays low. Stems are stored as 192 kbps MP3 in IndexedDB (about 5 MB per stem for a 4-minute song). You can delete them per song.
- The browser caches the model after the first download (Cache Storage).
- **Licence note:** the Demucs code is MIT, but the pretrained HTDemucs weights are from Meta for **personal and research use**. That's fine for a practice tool for you and your friends. For a commercial product, you'd need differently licensed weights.
- `src/lib/stems/demucs/` is vendored from demucs-js. One fix was made: `istft()` subtracted the FFT size from an explicit output length, which made the inverse spectrogram read past each row, giving a little crosstalk and NaNs at chunk edges. Our test showed the vocal stem improving from 21.1 to 22.8 dB SDR after the fix.

### Known limits
- Without separating, tabs and drums come from the **full mix**. Run **Separate instruments** for much cleaner tabs, drums and lyrics.
- The chord vocabulary covers the common qualities plus slash chords. 9ths, 11ths, 13ths and altered chords show as their closest relative (for example C9 shows as C7).
- Separation without WebGPU is slow, and very long songs need a lot of memory.
- Transpose changes the **chord names and shapes**, not the audio pitch.
- The in-browser Whisper download is about 80 MB the first time. Groq is faster.
- Tab capture works in Chrome / Edge on desktop. Other browsers can upload or record with the mic.

### Roadmap ideas
1. Pitch-shifting the audio for real transposition (WSOLA / phase vocoder in an AudioWorklet)
2. Play-along scoring: the mic listens and tells you which chords you hit
3. A 6-stem model (adds guitar and piano), and per-stem chord/riff views
4. Shareable songbooks and setlists, and an offline PWA install

---

## Licences of the open-source parts
- demucs-js (bakkot) — MIT · Demucs (Meta) — MIT code, HTDemucs weights for personal/research use
- ONNX Runtime Web — MIT · Mediabunny + @mediabunny/mp3-encoder — MPL-2.0 (LAME: LGPL)
- Spotify Basic Pitch — Apache-2.0
- TensorFlow.js — Apache-2.0
- transformers.js / ONNX Runtime Web — Apache-2.0 / MIT
- OpenAI Whisper models — MIT
- Outfit and JetBrains Mono fonts — SIL Open Font License
