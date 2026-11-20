// The neural beat tracker (Beat This!, the model the app ships: BE/api/src/server/audio/data/beat-this) on every song of
// the benchmark's folders, with the app's own pre- and post-processing (Shared/core/src/lib/beatThis/core.ts):
//   node beatthis.mjs <folder> [<folder> ...]      writes <folder>/beatthis.json
// bench.mjs then also scores the two trackers together, as the studio uses them ("both").
// The network runs with onnxruntime-node (after `pnpm install`), or else with Python's onnxruntime (pip install
// onnxruntime numpy); the result is the same model either way. ffmpeg is needed (the model hears 22 050 Hz).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire, register } from 'node:module';
import { fileURLToPath } from 'node:url';

// the shared package imports its files without ".ts": told to Node here, for this script only
register('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs'; import { fileURLToPath, pathToFileURL } from 'node:url'; import path from 'node:path';
export async function resolve(spec, ctx, next){
  if(spec.startsWith('.') && ctx.parentURL && ctx.parentURL.startsWith('file:') && !path.extname(spec)){
    const f = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec) + '.ts';
    if(existsSync(f)) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(spec, ctx);
}`));
const here = path.dirname(fileURLToPath(import.meta.url)), api = path.resolve(here, '../../../../BE/api');
const { beatThisWith, BEAT_THIS_SR, BINS, MELS } = await import('../../../../Shared/core/src/lib/beatThis/core.ts');
const DATA = path.join(api, 'src/server/audio/data/beat-this'), MODEL = path.join(DATA, 'beat_this_final0.int8.onnx');
const fbBuf = fs.readFileSync(path.join(DATA, 'mel-filterbank.bin')), fb = new Float32Array(fbBuf.buffer.slice(fbBuf.byteOffset, fbBuf.byteOffset + fbBuf.byteLength));
if(fb.length !== BINS * MELS) throw new Error('the mel filterbank has the wrong size');
const AUDIO = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.opus'];

async function runner(){
  try{
    const ort = createRequire(path.join(api, 'package.json'))('onnxruntime-node');
    const session = await ort.InferenceSession.create(MODEL, { graphOptimizationLevel: 'all' });
    console.log('network: onnxruntime-node');
    return async (input, len) => { const r = await session.run({ spect: new ort.Tensor('float32', input, [1, len, MELS]) }); return [Float32Array.from(r.beat.data), Float32Array.from(r.downbeat.data)]; };
  }catch(e){ /* not installed here: Python's */ }
  const py = ['python3', 'python'].find((c) => spawnSync(c, ['-c', 'import onnxruntime, numpy'], { stdio: 'ignore' }).status === 0);
  if(!py) throw new Error('no ONNX Runtime found: run `pnpm install` in shubix/, or `pip install onnxruntime numpy`');
  console.log('network: Python onnxruntime');
  const code = 'import sys,numpy as np,onnxruntime as o\n' +
    's=o.InferenceSession(sys.argv[1],providers=["CPUExecutionProvider"])\n' +
    'x=np.frombuffer(sys.stdin.buffer.read(),dtype="<f4").reshape(1,int(sys.argv[2]),int(sys.argv[3]))\n' +
    'b,d=s.run(["beat","downbeat"],{"spect":x})\n' +
    'sys.stdout.buffer.write(np.ascontiguousarray(b,dtype="<f4").tobytes()+np.ascontiguousarray(d,dtype="<f4").tobytes())\n';
  return async (input, len) => {
    const r = spawnSync(py, ['-c', code, MODEL, String(len), String(MELS)], { input: Buffer.from(input.buffer, input.byteOffset, input.byteLength), maxBuffer: 1 << 28 });
    if(r.status !== 0) throw new Error('the network failed: ' + String(r.stderr).trim().slice(-300));
    const all = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
    if(all.length !== 2 * len) throw new Error('the network gave ' + all.length + ' values for ' + len + ' frames');
    return [all.slice(0, len), all.slice(len)];
  };
}
function mono22k(file){
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(BEAT_THIS_SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if(r.error || r.status !== 0) throw new Error('ffmpeg could not read ' + file + (r.error ? ': ' + r.error.message : ': ' + String(r.stderr).trim().slice(0, 200)));
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
}

const dirs = process.argv.slice(2);
if(!dirs.length){ console.error('usage: node beatthis.mjs <folder> [<folder> ...]'); process.exit(2); }
const run = await runner();
for(const dir of dirs){
  const out = {};
  for(const f of fs.readdirSync(dir).sort()){
    const ext = path.extname(f).toLowerCase(); if(!AUDIO.includes(ext)) continue;
    const t0 = Date.now(), r = await beatThisWith(mono22k(path.join(dir, f)), fb, run);
    out[f.slice(0, f.length - ext.length)] = { beats: r.beats, downbeats: r.downbeats };
    console.log('  ' + path.join(path.basename(path.resolve(dir)), f).padEnd(44), String(r.beats.length).padStart(4) + ' beats', String(r.downbeats.length).padStart(4) + ' bars ', (Date.now() - t0) + ' ms');
  }
  fs.writeFileSync(path.join(dir, 'beatthis.json'), JSON.stringify(out) + '\n');
}
