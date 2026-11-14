// Test media for the start-to-end check (no copyrighted material): clips a machine can tell apart, and songs whose
// beats are known.
//   node make-media.mjs <out> <beats>     <beats> is the folder make-sets.mjs of ../studio-beats made (set2, set3)
// Each clip is one colour of its own (the hue says which clip a frame of the exported Reel came from), with a white
// box moving across it and film grain, so there is movement and something sharp to measure. Clip 5 is black for its
// first three seconds: the edit should not show that part.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [out, beats] = process.argv.slice(2).map((p) => path.resolve(p));
if (!out || !beats) { console.error('usage: node make-media.mjs <out> <beats>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const N = 12, hue = (i) => i * 360 / N;
const rgb = (h) => { const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (0.85 - 0.75 * Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; };
const clips = [];
for (let i = 0; i < N; i++) {
  const dur = 5 + (i * 7) % 5, [r, g, b] = rgb(hue(i)), hex = '0x' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const speed = 60 + 40 * (i % 4), file = `clip${String(i).padStart(2, '0')}.webm`;
  const vf = [`drawbox=x='mod(t*${speed},440)':y='200+${30 * (i % 5)}':w=100:h=160:color=white@0.9:t=fill`, 'noise=alls=10:allf=t',
    ...(i === 5 ? ["eq=brightness='if(lt(t,3),-0.95,0)':eval=frame"] : [])].join(',');
  const r2 = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${hex}:s=540x960:r=30:d=${dur}`, '-vf', vf,
    '-c:v', 'libvpx', '-b:v', '1500k', '-deadline', 'realtime', '-cpu-used', '8', '-g', '15', '-an', path.join(out, file)], { stdio: 'inherit' });
  if (r2.status !== 0) { console.error('ffmpeg failed for ' + file); process.exit(1); }
  clips.push({ file, index: i, hue: hue(i), rgb: [r, g, b], dur, ...(i === 5 ? { darkUntil: 3 } : {}) });
}
const songs = [];
for (const [set, name] of [['set2', 'four_floor_124'], ['set3', 'bhangra_dhol_98'], ['set3', 'bollywood_dembow_96']]) {
  const wav = path.join(beats, set, name + '.wav'), truth = JSON.parse(fs.readFileSync(path.join(beats, set, 'truth.json'), 'utf8'))[name];
  fs.copyFileSync(wav, path.join(out, name + '.wav'));
  songs.push({ file: name + '.wav', name, beats: truth });
}
fs.writeFileSync(path.join(out, 'media.json'), JSON.stringify({ clips, songs }, null, 1));
console.log('made ' + clips.length + ' clips and ' + songs.length + ' songs in ' + out);
