// Downloads the HTDemucs ONNX model (from the MIT-licensed `demucs` npm package by bakkot)
// into public/models/htdemucs.onnx. Run: npm run fetch-model
import { createGunzip } from 'node:zlib';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';

const OUT = new URL('../public/models/htdemucs.onnx', import.meta.url);
const TARBALL = 'https://registry.npmjs.org/demucs/-/demucs-1.0.0.tgz';
const WANT = 'package/htdemucs.onnx';

if (process.env.SKIP_MODEL) {
  console.log('SKIP_MODEL set — not bundling the separation model.');
  process.exit(0);
}
if (existsSync(OUT) && statSync(OUT).size > 100e6) {
  console.log('Model already present:', OUT.pathname);
  process.exit(0);
}
mkdirSync(new URL('../public/models/', import.meta.url), { recursive: true });
console.log('Downloading', TARBALL);
const res = await fetch(TARBALL);
if (!res.ok) throw new Error('Download failed: ' + res.status);
const gunzip = Readable.fromWeb(res.body).pipe(createGunzip());

// Minimal tar reader: 512-byte headers, file data padded to 512.
let buf = Buffer.alloc(0);
let state = { need: 512, mode: 'header', name: '', size: 0, out: null, left: 0 };
let done = false;
for await (const chunk of gunzip) {
  if (done) break;
  buf = Buffer.concat([buf, chunk]);
  while (!done) {
    if (state.mode === 'header') {
      if (buf.length < 512) break;
      const h = buf.subarray(0, 512);
      buf = buf.subarray(512);
      if (h.every((b) => b === 0)) { done = true; break; }
      const name = h.subarray(0, 100).toString().replace(/\0.*$/s, '');
      const prefix = h.subarray(345, 500).toString().replace(/\0.*$/s, '');
      const size = parseInt(h.subarray(124, 136).toString().replace(/\0.*$/s, '').trim() || '0', 8);
      const full = prefix ? prefix + '/' + name : name;
      state = { mode: 'data', name: full, size, left: Math.ceil(size / 512) * 512, written: 0, out: full === WANT ? createWriteStream(OUT) : null };
    } else {
      if (!buf.length) break;
      const take = Math.min(buf.length, state.left);
      const data = buf.subarray(0, take);
      buf = buf.subarray(take);
      if (state.out) {
        const real = data.subarray(0, Math.max(0, Math.min(take, state.size - state.written)));
        state.out.write(real);
        state.written += real.length;
      } else state.written += take;
      state.left -= take;
      if (state.left === 0) {
        if (state.out) {
          await new Promise((r) => state.out.end(r));
          console.log('Saved', OUT.pathname, (state.size / 1e6).toFixed(1), 'MB');
          done = true;
          break;
        }
        state = { mode: 'header' };
      }
    }
  }
}
if (!existsSync(OUT)) throw new Error('htdemucs.onnx not found in the package');
