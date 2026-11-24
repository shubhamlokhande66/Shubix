// A folder of finished Reels, studied in one command: each file is checked (sound, length, size, a copy of another),
// measured (analyze.mjs), and its movement read against its cuts and beats. The set is halved by creator: a rule is
// found on the "learn" half and must hold on the "check" half. Work done is kept in the output folder, so a stopped run
// goes on where it was.   node study.mjs <folder> <out>      (Node 22.18+, ffmpeg)
// Creator: the file's name before "__" (priya__trip1.mp4); without it each file counts as its own creator.
// Group: the first folder under <folder> (travel/, food/ ...). The videos and <out> stay outside the repository.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { measure, summarize } from './analyze.mjs';

const VERSION = 2, FPS = 30, W = 48, H = 84, EDGE = 0.2, MIN_SHOT = 0.8, NEAR = 0.07;
const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
export const creatorOf = (file) => { const b = path.basename(file).toLowerCase(), i = b.indexOf('__'); return i > 0 ? b.slice(0, i) : b; };
/** the creators in two halves, the same for the same set */
export function halves(creators) {
  const key = (c) => crypto.createHash('sha1').update('shubix-study:' + c).digest('hex');
  const s = [...new Set(creators)].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return new Map(s.map((c, i) => [c, i % 2 ? 'check' : 'learn']));
}

/** movement between one picture and the next, 30 a second, with the light's change taken out (a flash is no movement) */
function movement(file) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-an', '-vf', `fps=${FPS},scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error('the picture could not be read');
  const n = W * H, k = Math.floor(r.stdout.length / n), m = new Float64Array(k), light = new Float64Array(k);
  for (let f = 0; f < k; f++) { let s = 0; for (let i = 0; i < n; i++) s += r.stdout[f * n + i]; light[f] = s / n; }
  for (let f = 1; f < k; f++) { const d = light[f] - light[f - 1]; let s = 0; for (let i = 0; i < n; i++) s += Math.abs(r.stdout[f * n + i] - r.stdout[(f - 1) * n + i] - d); m[f] = s / n; }
  return { m, light };
}
/** every shot that can be judged: its movement by fifths (1 = the shot's mean) and its strongest moment. 0.2 s at each
 * end is left out: there a transition moves, not the footage. */
export function shotsOf(m, light, cuts, dur) {
  const edges = [0, ...cuts, dur], out = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const s = edges[i], e = edges[i + 1], a = Math.ceil((s + EDGE) * FPS), b = Math.min(m.length, Math.floor((e - EDGE) * FPS));
    if (e - s < MIN_SHOT || b - a < 10) continue;
    if (mean([...light.slice(a, b)]) < 20) continue;   // the black end card
    const x = []; for (let f = a; f < b; f++) x.push((m[Math.max(a, f - 1)] + m[f] + m[Math.min(b - 1, f + 1)]) / 3);
    const avg = mean(x); if (!(avg > 0.15)) continue;   // a photo or a held picture has no action
    const fifths = [0, 1, 2, 3, 4].map((k) => mean(x.slice(Math.floor(k * x.length / 5), Math.floor((k + 1) * x.length / 5))) / avg);
    const top = x.indexOf(Math.max(...x));
    out.push({ s, e, fifths, peak: (a + top) / FPS, strength: x[top] / avg, pos: top / (x.length - 1) });
  }
  return out;
}
const near = (t, beats) => beats.some((b) => Math.abs(b - t) <= NEAR);
/** peaks on the beat, against the same beats moved within their period (what a Reel of this tempo gives by chance) */
export function onBeat(shots, beats, period) {
  const P = shots.filter((x) => x.strength >= 1.3); if (!P.length || !period) return null;
  const share = (d) => mean(P.map((x) => (near(x.peak, beats.map((b) => b + d * period)) ? 1 : 0)));
  // every move counts, the beat's own neighbourhood too: together they cover the whole period evenly, so the mean is
  // what a peak at any moment would get
  const c = []; for (let k = 0; k < 24; k++) c.push(share(k / 24 - 0.5));
  return { real: share(0), chance: mean(c), n: P.length };
}
const sha = (f) => { const h = crypto.createHash('sha1'), fd = fs.openSync(f, 'r'), b = Buffer.alloc(1 << 20); let n; while ((n = fs.readSync(fd, b, 0, b.length, null))) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); };
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', file]);
  const j = JSON.parse(String(r.stdout) || '{}'), v = (j.streams || []).find((s) => s.codec_type === 'video');
  return { dur: +(j.format?.duration || 0), w: v?.width || 0, h: v?.height || 0, sound: (j.streams || []).some((s) => s.codec_type === 'audio') };
}
/** one Reel, in a process of its own: a low-memory computer measures 50 without filling up */
function one(file) {
  const r = measure(file), mv = movement(file), shots = shotsOf(mv.m, mv.light, r.cuts, r.dur);
  return { r, shots, beat: onBeat(shots, r.beatTimes, r.period) };
}
function rand(seed) { let s = seed; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** the mean with its 95% range, whole creators drawn again (one creator's Reels are alike and count together) */
export function range(rows, seed = 7) {
  const by = new Map(); for (const [c, v] of rows) if (v != null && Number.isFinite(v)) by.set(c, [...(by.get(c) || []), v]);
  const g = [...by.values()].map(mean); if (g.length < 5) return { mean: mean(g), low: null, high: null, n: g.length };
  const R = rand(seed), d = []; for (let k = 0; k < 4000; k++) d.push(mean(g.map(() => g[Math.floor(R() * g.length)])));
  d.sort((a, b) => a - b); return { mean: mean(g), low: d[100], high: d[3899], n: g.length };
}
function report(list) {
  const L = [], num = (v, k) => (v * k).toFixed(k === 1 ? 2 : 1);
  const f = (x, k = 1) => (x.mean == null ? '-' : num(x.mean, k) + (x.low == null ? ' (too few)' : ` (${num(x.low, k)} to ${num(x.high, k)})`));
  for (const half of ['learn', 'check', 'all']) {
    const A = list.filter((x) => half === 'all' || x.half === half), g = (fn) => range(A.map((x) => [x.creator, fn(x)]));
    L.push(`\n## ${half}: ${A.length} Reels, ${new Set(A.map((x) => x.creator)).size} creators, ${A.reduce((n, x) => n + x.shots.length, 0)} shots judged`);
    L.push('| measure | mean of creators (95% range) |', '|---|---|');
    L.push(`| peaks on the beat, above chance (points; 0 = chance) | ${f(g((x) => x.beat && x.beat.real - x.beat.chance), 100)} |`);
    ['first', '2nd', 'middle', '4th', 'last'].forEach((n, k) => L.push(`| movement in the ${n} fifth of a shot (1 = the shot's mean) | ${f(g((x) => mean(x.shots.map((s) => s.fifths[k]))))} |`));
    L.push(`| peak's place in the shot (0 start, 1 end, 0.5 = chance) | ${f(g((x) => mean(x.shots.filter((s) => s.strength >= 1.3).map((s) => s.pos))))} |`);
    L.push(`| opening, s | ${f(g((x) => x.r.hook))} |`, `| median shot, s | ${f(g((x) => x.r.shot.median))} |`, `| shots under 0.5 s, % | ${f(g((x) => x.r.under05s), 100)} |`);
  }
  return L.join('\n');
}
function walk(d, skip) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = path.join(d, e.name); return path.resolve(p) === skip ? [] : e.isDirectory() ? walk(p, skip) : /\.(mp4|mov|webm|m4v)$/i.test(e.name) ? [p] : []; }); }

function main() {
  if (process.argv[2] === '--one') { fs.writeFileSync(process.argv[4], JSON.stringify(one(process.argv[3]))); return; }
  const [dir, outDir] = process.argv.slice(2);
  if (!dir || !outDir) { console.error('node study.mjs <folder of Reels> <out folder>'); process.exit(1); }
  const keep = path.join(outDir, 'read'); fs.mkdirSync(keep, { recursive: true });
  const files = walk(dir, path.resolve(outDir)).sort(), seen = new Map(), list = [], left = [];
  files.forEach((file, i) => {
    const name = path.relative(dir, file).replaceAll('\\', '/'), no = `${i + 1}/${files.length} ${name}`;
    try {
      const p = probe(file), h = sha(file);
      const why = seen.has(h) ? `same file as ${seen.get(h)}` : !p.w ? 'no picture' : !p.sound ? 'no sound' : p.dur < 4 ? 'under 4 s' : p.dur > 180 ? 'over 3 minutes' : '';
      if (!seen.has(h)) seen.set(h, name);
      if (why) { left.push({ name, why }); console.log(`${no}: left out, ${why}`); return; }
      const at = path.join(keep, `${h}.v${VERSION}.json`);
      if (!fs.existsSync(at)) {
        const tmp = at + '.part', r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--one', file, tmp], { encoding: 'utf8', timeout: 900_000 });
        if (r.status !== 0) throw new Error((r.stderr || String(r.error || 'stopped')).trim().split('\n').find((l) => /Error/.test(l)) || 'stopped');
        fs.renameSync(tmp, at);
      }
      const d = JSON.parse(fs.readFileSync(at, 'utf8')), sub = name.split('/');
      list.push({ ...d, name, creator: creatorOf(file), group: sub.length > 1 ? sub[0] : 'all', w: p.w, h: p.h });
      console.log(`${no}: ${d.r.shots} shots, ${d.r.bpm ?? '?'} BPM`);
    } catch (e) { left.push({ name, why: e.message }); console.log(`${no}: not measured, ${e.message}`); }
  });
  // sent again in other quality: not the same bytes, but as long, as bright and cut at the same places
  const same = (a, b) => Math.abs(a.r.dur - b.r.dur) < 0.15 && Math.abs(a.r.luma - b.r.luma) < 1.5 && a.r.cuts.length === b.r.cuts.length && a.r.cuts.every((c, k) => Math.abs(c - b.r.cuts[k]) < 0.1);
  const kept = [];
  for (const x of list) { const k = kept.find((y) => same(y, x)); if (k) left.push({ name: x.name, why: `looks the same as ${k.name}` }); else kept.push(x); }
  const H2 = halves(kept.map((x) => x.creator)); kept.forEach((x) => { x.half = H2.get(x.creator); });
  const groups = Object.fromEntries([...new Set(kept.map((x) => x.group))].map((g) => [g, summarize(kept.filter((x) => x.group === g).map((x) => x.r))]));
  const md = `# Reel study, ${new Date().toISOString().slice(0, 10)}\n${kept.length} of ${files.length} Reels measured; ${left.length} left out.\nA rule is kept only when its range clears chance on "learn" AND on "check".\n${report(kept)}\n` + (left.length ? `\n## Left out\n${left.map((x) => `- ${x.name}: ${x.why}`).join('\n')}\n` : '');
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
  fs.writeFileSync(path.join(outDir, 'study.json'), JSON.stringify({ version: VERSION, groups, left, reels: kept }, null, 1));
  console.log('\n' + md);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
