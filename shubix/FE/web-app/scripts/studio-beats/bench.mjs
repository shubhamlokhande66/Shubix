// The beat benchmark: how exactly does the studio's own beat tracker (Shared/core engine/studio/song.ts, the code the
// website and the Android app run) find the beats of a song whose beats are known?
//
//   node bench.mjs <folder> [<folder> ...]            score every song in the folders
//   node bench.mjs --check baseline.json <folder> ... also compare with the kept results: exit 1 if a set got worse
//   node bench.mjs --write baseline.json <folder> ... keep these results as the ones to compare with
//
// A folder is one set. Its songs' true beats come from either
//   truth.json            { "<name>": [beat times in seconds] } next to <name>.wav (the synthetic sets: make_set*.py), or
//   <name>.beats.txt      one beat time per line, in seconds, next to <name>.<wav|mp3|m4a|aac|ogg|flac|opus> (real songs:
//                         tap them with tap.html, or export a label track from Audacity; text after the number is ignored)
// Real songs are decoded with ffmpeg (it must be installed). They are never put in the repository (.gitignore: real/).
// With a beatthis.json in the folder ({ "<name>": { "beats": [...] } }: the neural tracker's beats for each song), the
// two together, as the studio uses them, are scored as well ("both").
//
// What is measured, per song and as the set's mean:
//   F70   F-measure with a beat counted within ±70 ms (the usual standard for beat tracking)
//   F40   the same within ±40 ms: about one frame of video, what a cut on the beat needs
//   off   the median distance of the found beats from the true ones, in ms (of the beats within ±70 ms)
//   tempo found beats / true beats: 1.00 is right; 2.00 or 0.50 is twice or half the tempo, 1.50 a triplet count
// Nothing is estimated: a song with no truth is skipped and said so.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { songAnalysis } from '../../../../Shared/core/src/engine/studio/song.ts';

const AUDIO = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.opus'];
/** how far a set's mean may fall below the kept result before the check fails (points of F, 0-100) */
const SLACK = 1;

function readWav(file){
  const d = fs.readFileSync(file);
  if(d.toString('ascii', 0, 4) !== 'RIFF' || d.toString('ascii', 8, 12) !== 'WAVE') return null;
  let o = 12, sr = 0, ch = 0, bits = 0, fmt = 0, data = null;
  while(o + 8 <= d.length){
    const id = d.toString('ascii', o, o + 4), sz = d.readUInt32LE(o + 4);
    if(id === 'fmt '){ fmt = d.readUInt16LE(o + 8); ch = d.readUInt16LE(o + 10); sr = d.readUInt32LE(o + 12); bits = d.readUInt16LE(o + 22); }
    if(id === 'data'){ data = d.subarray(o + 8, Math.min(d.length, o + 8 + sz)); break; }
    o += 8 + sz + (sz & 1);
  }
  if(!data || fmt !== 1 || bits !== 16 || !ch || !sr) return null;   // anything else goes through ffmpeg
  const n = Math.floor(data.length / (2 * ch)), x = new Float32Array(n);
  for(let i = 0; i < n; i++){ let s = 0; for(let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); x[i] = s / ch / 32768; }
  return { x, sr };
}
function decode(file){
  if(path.extname(file).toLowerCase() === '.wav'){ const w = readWav(file); if(w) return w; }
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '44100', '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  if(r.error || r.status !== 0) throw new Error('ffmpeg could not read ' + file + (r.error ? ': ' + r.error.message : ': ' + String(r.stderr).trim().slice(0, 200)));
  const b = r.stdout, x = new Float32Array(b.length >> 1);
  for(let i = 0; i < x.length; i++) x[i] = b.readInt16LE(i * 2) / 32768;
  return { x, sr: 44100 };
}
const beatsOfText = (text) => text.split(/\r?\n/).map((l) => parseFloat(l.trim())).filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);

/** each true beat takes the nearest found beat not yet taken, within `tol`: the hits and how far each was (seconds) */
export function matchBeats(found, truth, tol){
  const det = [...found].sort((a, b) => a - b), used = new Uint8Array(det.length), offs = [];
  let lo = 0;
  for(const t of truth){
    while(lo < det.length && det[lo] < t - tol) lo++;
    let bi = -1, bd = tol + 1e-9;
    for(let i = lo; i < det.length && det[i] <= t + tol; i++){ const dd = Math.abs(det[i] - t); if(!used[i] && dd < bd){ bd = dd; bi = i; } }
    if(bi >= 0){ used[bi] = 1; offs.push(bd); }
  }
  const hit = offs.length, R = truth.length ? hit / truth.length : 0, P = det.length ? hit / det.length : 0;
  return { f: P + R > 0 ? 2 * P * R / (P + R) : 0, precision: P, recall: R, offs };
}
const median = (v) => { if(!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function songsOf(dir){
  const out = [], skipped = [];
  const truthFile = path.join(dir, 'truth.json');
  if(fs.existsSync(truthFile)){
    for(const [name, beats] of Object.entries(JSON.parse(fs.readFileSync(truthFile, 'utf8')))){
      const file = AUDIO.map((e) => path.join(dir, name + e)).find((f) => fs.existsSync(f));
      if(file) out.push({ name, file, truth: [...beats].sort((a, b) => a - b) }); else skipped.push(name + ' (no audio file)');
    }
  }
  for(const f of fs.readdirSync(dir).sort()){
    const ext = path.extname(f).toLowerCase(), name = f.slice(0, f.length - ext.length);
    if(!AUDIO.includes(ext) || out.some((s) => s.name === name)) continue;
    const txt = path.join(dir, name + '.beats.txt');
    if(!fs.existsSync(txt)){ if(!fs.existsSync(truthFile)) skipped.push(f + ' (no ' + name + '.beats.txt)'); continue; }
    const truth = beatsOfText(fs.readFileSync(txt, 'utf8'));
    if(truth.length < 8) skipped.push(f + ' (under 8 beats marked)'); else out.push({ name, file: path.join(dir, f), truth });
  }
  return { out, skipped };
}

function scoreSet(dir){
  const { out: songs, skipped } = songsOf(dir), rows = [];
  const aiFile = path.join(dir, 'beatthis.json'), ai = fs.existsSync(aiFile) ? JSON.parse(fs.readFileSync(aiFile, 'utf8')) : null;
  for(const s of songs){
    const { x, sr } = decode(s.file), t0 = Date.now(), r = songAnalysis(x, sr), ms = Date.now() - t0;
    // the true beats of the part the song really plays (a marker past the end of the file is a marking mistake)
    const dur = x.length / sr, truth = s.truth.filter((t) => t <= dur);
    const a = matchBeats(r.beats, truth, 0.07), b = matchBeats(r.beats, truth, 0.04), off = median(a.offs);
    const aiBeats = ai && ai[s.name] && Array.isArray(ai[s.name].beats) ? ai[s.name].beats : null;
    const both = aiBeats ? matchBeats(songAnalysis(x, sr, { beats: aiBeats }).beats, truth, 0.07).f : null;
    rows.push({ name: s.name, f70: a.f, f40: b.f, both, offMs: off === null ? null : off * 1000, tempo: truth.length ? r.beats.length / truth.length : null, bpm: r.period ? 60 / r.period : null, ms, beats: r.beats.length, truth: truth.length });
  }
  const mean = (k) => rows.length ? rows.reduce((n, r) => n + r[k], 0) / rows.length : null;
  const withBoth = rows.filter((r) => r.both !== null);
  return { set: path.basename(path.resolve(dir)), songs: rows.length, f70: mean('f70'), f40: mean('f40'),
    both: withBoth.length === rows.length && rows.length ? withBoth.reduce((n, r) => n + r.both, 0) / rows.length : null, rows, skipped };
}

const pct = (v) => v === null ? '   - ' : (v * 100).toFixed(1).padStart(5) + '%';
function print(res){
  console.log('\n' + res.set + ' · ' + res.songs + ' song' + (res.songs === 1 ? '' : 's'));
  for(const r of res.rows){
    console.log('  ' + r.name.padEnd(30).slice(0, 30), 'F70', pct(r.f70), ' F40', pct(r.f40), ' off', (r.offMs === null ? '-' : r.offMs.toFixed(0)).padStart(3) + ' ms',
      ' tempo', r.tempo === null ? '-' : r.tempo.toFixed(2), ' ', (r.bpm === null ? '-' : r.bpm.toFixed(1)).padStart(5), 'BPM ', r.ms + ' ms', r.both === null ? '' : ' both F70 ' + pct(r.both));
  }
  for(const s of res.skipped) console.log('  skipped: ' + s);
  if(res.songs) console.log('  mean'.padEnd(32), 'F70', pct(res.f70), ' F40', pct(res.f40), res.both === null ? '' : ' both F70 ' + pct(res.both));
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); if(i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const check = opt('--check'), write = opt('--write');
  if(!args.length){ console.error('usage: node bench.mjs [--check baseline.json | --write baseline.json] <folder> [<folder> ...]'); process.exit(2); }
  const results = args.map((dir) => { if(!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()){ console.error('not a folder: ' + dir); process.exit(2); } return scoreSet(dir); });
  results.forEach(print);
  const round = (v) => Math.round(v * 1000) / 10;
  const summary = Object.fromEntries(results.filter((r) => r.songs).map((r) => [r.set, { songs: r.songs, f70: round(r.f70), f40: round(r.f40) }]));
  console.log('\n' + Object.entries(summary).map(([k, v]) => k + ': F70 ' + v.f70 + '%  F40 ' + v.f40 + '% (' + v.songs + ')').join('\n'));
  if(write){ fs.writeFileSync(write, JSON.stringify({ tracker: 'own', slack: SLACK, sets: summary }, null, 2) + '\n'); console.log('\nkept in ' + write); }
  if(check){
    const base = JSON.parse(fs.readFileSync(check, 'utf8')).sets, bad = [];
    for(const [set, was] of Object.entries(base)){
      const now = summary[set];
      if(!now){ console.log('not scored now (its folder was not given): ' + set); continue; }
      if(now.songs !== was.songs) bad.push(set + ': ' + now.songs + ' songs, the kept result has ' + was.songs);
      for(const k of ['f70', 'f40']) if(now[k] < was[k] - SLACK) bad.push(set + ' ' + k.toUpperCase() + ': ' + now[k] + '% now, ' + was[k] + '% kept');
    }
    if(bad.length){ console.error('\nBeat accuracy got worse:\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('\nNo set is worse than the kept results (within ' + SLACK + ' point).');
  }
}
