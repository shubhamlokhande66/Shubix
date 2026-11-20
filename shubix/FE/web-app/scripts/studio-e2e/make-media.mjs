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
// one clip of 4 s, by itself too little for the usual Reel (5 s of good video): its own runs (E, F), not among the 12;
// and one of 10 s, one take (run G). Their box really moves, so the speed they play at can be measured in the file
for (const [file, secs, h] of [['short4.webm', 4, 15], ['take10.webm', 10, 195]]) { const [r, g, b] = rgb(h), hex = '0x' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const r2 = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${hex}:s=540x960:r=30:d=${secs}`, '-f', 'lavfi', '-i', `color=c=white:s=100x160:r=30:d=${secs}`,
    // (a box laid over the picture moves with the time; drawbox's own "t" is its thickness, so the 12 clips' boxes stand still)
    '-filter_complex', "[0][1]overlay=x='mod(t*100,440)':y=260,noise=alls=10:allf=t",
    '-c:v', 'libvpx', '-b:v', '1500k', '-deadline', 'realtime', '-cpu-used', '8', '-g', '15', '-an', path.join(out, file)], { stdio: 'inherit' });
  if (r2.status !== 0) { console.error('ffmpeg failed for ' + file); process.exit(1); }
  clips.push({ file, index: clips.length, hue: h, rgb: [r, g, b], dur: secs, short: true }); }
const songs = [];
for (const [set, name] of [['set2', 'four_floor_124'], ['set3', 'bhangra_dhol_98'], ['set3', 'bollywood_dembow_96'], ['set1', 'slow_72']]) {
  const wav = path.join(beats, set, name + '.wav'), truth = JSON.parse(fs.readFileSync(path.join(beats, set, 'truth.json'), 'utf8'))[name];
  fs.copyFileSync(wav, path.join(out, name + '.wav'));
  songs.push({ file: name + '.wav', name, beats: truth });
}
// Talking clips (a vlog, a tutorial): ../studio-talk/make_talk.py speaks known phrases with known pauses (espeak-ng) over
// a room of one colour each. Without espeak-ng they are left out, and said so.
const talk = [];
if (spawnSync('espeak-ng', ['--version'], { stdio: 'ignore' }).status === 0) {
  const py = ['python3', 'python'].find((c) => spawnSync(c, ['-c', 'import numpy'], { stdio: 'ignore' }).status === 0);
  const r3 = spawnSync(py, [path.join(path.dirname(new URL(import.meta.url).pathname), '../studio-talk/make_talk.py')], { cwd: out, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r3.status !== 0) { console.error('make_talk.py failed'); process.exit(1); }
  const truth = JSON.parse(fs.readFileSync(path.join(out, 'out/talk_truth.json'), 'utf8')), rooms = ['3a5f7d', '6d4c3d', '2f5d50'];
  const hueOf = (hex) => { const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    return ((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360; };
  Object.keys(truth).forEach((name, n) => talk.push({ file: 'out/' + name + '.webm', name, hue: Math.round(hueOf(rooms[n]) * 10) / 10, ...truth[name] }));
} else console.log('espeak-ng not found: the talking clips were not made');
fs.writeFileSync(path.join(out, 'media.json'), JSON.stringify({ clips, songs, talk }, null, 1));
console.log('made ' + clips.length + ' clips (one of 4 s), ' + songs.length + ' songs and ' + talk.length + ' talking clips in ' + out);
