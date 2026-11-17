// Reference Reels, measured: how real edited Reels cut against their own music. For each video: its song's beats and
// drops (the studio's own song analysis, Shared/core/src/engine/studio/song.ts, the code the website and the app run),
// where the picture cuts (ffmpeg's scene change, on a small copy), and its light and colour; then the numbers Shubix's
// edit is tuned by: shot lengths in seconds and in beats, the hook, cuts on the beat, cuts on the drops, the cut rate
// by section. Writes one JSON with every Reel and a summary.
//   node analyze.mjs out.json video1.mp4 video2.mp4 ...        (Node 22.18+, ffmpeg)
//   ANON=1 names them r01, r02... (what is kept in references.json: no one's file names)
// The videos are never put in the repository: only these numbers are.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { songAnalysis } from '../../../../Shared/core/src/engine/studio/song.ts';

const SR = 22050, SCENE = Number(process.env.SCENE || 0.32), LEAD = 1 / 30;
function audio(file) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || !r.stdout.length) return null;
  const b = r.stdout, x = new Float32Array(b.length >> 1); for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(i * 2) / 32768; return x;
}
/** where the picture cuts: scene changes over SCENE, never two within 0.12 s (a flash or a glitch is one cut) */
function cuts(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-an', '-vf', `scale=180:-2,select='gt(scene,${SCENE})',metadata=print:file=-`, '-f', 'null', '-'], { maxBuffer: 1 << 28 });
  const out = String(r.stdout), ts = [...out.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]);
  return ts.filter((t, i) => !i || t - ts[i - 1] > 0.12);
}
/** light and colour, one reading every 0.5 s: mean luma (0-255) and saturation */
function look(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-an', '-vf', 'fps=2,scale=96:-2,signalstats,metadata=print:file=-', '-f', 'null', '-'], { maxBuffer: 1 << 28 });
  const s = String(r.stdout), y = [...s.matchAll(/signalstats\.YAVG=([\d.]+)/g)].map((m) => +m[1]), sat = [...s.matchAll(/signalstats\.SATAVG=([\d.]+)/g)].map((m) => +m[1]);
  const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
  return { luma: mean(y), sat: mean(sat), dark: y.length ? y.filter((v) => v < 25).length / y.length : null };
}
const med = (a) => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const r3 = (v) => (v == null ? null : +v.toFixed(3));

export function measure(file) {
  const dur = Number(String(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout).trim());
  const x = audio(file), song = x ? songAnalysis(x, SR) : null;
  const beats = song ? song.beats.filter((b) => b < dur) : [], period = song && song.period > 0 ? song.period : null;
  const drops = song ? song.cuts.filter((c, k) => song.cutType[k] === 'drop' && c < dur) : [];
  const c = cuts(file).filter((t) => t > 0.2 && t < dur - 0.2), edges = [0, ...c, dur], shots = edges.slice(1).map((e, i) => e - edges[i]);
  // a cut on the beat: within 70 ms of one, allowing an editor's one frame early
  const off = (t) => (beats.length ? Math.min(...beats.map((b) => Math.min(Math.abs(t - b), Math.abs(t + LEAD - b)))) : null);
  const offs = c.map(off).filter((v) => v != null);
  // also against the half beats (an eighth note: many edits cut between the beats) and the drum hits the studio hears
  const halves = period ? beats.flatMap((b) => [b, b + period / 2]) : [];
  const hits = song ? song.hitsRaw.filter((h, k) => (song.hitsStr[k] || 0) >= med(song.hitsStr)) : [];
  const near = (t, A) => (A.length ? Math.min(...A.map((b) => Math.min(Math.abs(t - b), Math.abs(t + LEAD - b)))) : null);
  const share = (A) => (A.length && c.length ? r3(c.filter((t) => near(t, A) <= 0.07).length / c.length) : null);
  const onDrop = drops.map((d) => c.some((t) => Math.abs(t - d) < 0.12));
  const third = dur / 3, rate = (a, b) => c.filter((t) => t >= a && t < b).length / Math.max(0.5, b - a);
  return {
    file: path.basename(file), dur: r3(dur), bpm: period ? +(60 / period).toFixed(1) : null, beats: beats.length, drops: drops.map(r3),
    cuts: c.map(r3), beatTimes: beats.map(r3), period: r3(period), shots: shots.length, shot: { median: r3(med(shots)), shortest: r3(Math.min(...shots)), longest: r3(Math.max(...shots)) },
    shotBeats: period ? r3(med(shots) / period) : null, hook: r3(shots[0]), hookBeats: period ? r3(shots[0] / period) : null,
    onHalfBeat: share(halves), onHit: share(hits),
    onBeat: offs.length ? r3(offs.filter((v) => v <= 0.07).length / offs.length) : null, meanOffMs: offs.length ? Math.round(offs.reduce((p, q) => p + q, 0) / offs.length * 1000) : null,
    dropsCut: drops.length ? r3(onDrop.filter(Boolean).length / drops.length) : null,
    cutRate: { start: r3(rate(0, third)), middle: r3(rate(third, 2 * third)), end: r3(rate(2 * third, dur)) },
    under05s: r3(shots.filter((s) => s < 0.5).length / shots.length), ...look(file),
  };
}

/** the style of a set of Reels: each number's median, and its middle half (the 25th to 75th percentile) */
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
export const STYLE = {
  dur: (r) => r.dur, bpm: (r) => r.bpm, shot: (r) => r.shot.median, shortest: (r) => r.shot.shortest, longest: (r) => r.shot.longest,
  shotBeats: (r) => r.shotBeats, hook: (r) => r.hook, hookBeats: (r) => r.hookBeats, under05s: (r) => r.under05s,
  rateStart: (r) => r.cutRate.start, rateMiddle: (r) => r.cutRate.middle, rateEnd: (r) => r.cutRate.end,
  onBeat: (r) => r.onBeat, onHalfBeat: (r) => r.onHalfBeat, onHit: (r) => r.onHit, luma: (r) => r.luma, sat: (r) => r.sat,
};
export function summarize(reels) {
  const out = { reels: reels.length };
  for (const [k, f] of Object.entries(STYLE)) { const a = reels.map(f).filter((v) => v != null && Number.isFinite(v)); out[k] = { median: r3(q(a, 0.5)), low: r3(q(a, 0.25)), high: r3(q(a, 0.75)) }; }
  return out;
}
// run as a script (not imported by compare.mjs): pathToFileURL, as a Windows path is file:///C:/… and not file://C:\…
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outFile, ...files] = process.argv.slice(2);
  if (!outFile || !files.length) { console.error('node analyze.mjs out.json video.mp4 ...'); process.exit(1); }
  const reels = [];
  for (const f of files) { try { const m = measure(f); reels.push(m); console.log(`${m.file}: ${m.dur}s ${m.bpm} BPM, ${m.shots} shots (median ${m.shot.median}s = ${m.shotBeats} beats), hook ${m.hook}s, under 0.5 s ${m.under05s}`); } catch (e) { console.log(`${path.basename(f)}: not measured (${e.message.slice(0, 120)})`); } }
  if (process.env.ANON) reels.forEach((r, i) => { r.file = `r${String(i + 1).padStart(2, '0')}`; });
  const summary = summarize(reels);
  fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString().slice(0, 10), scene: SCENE, summary, reels }, null, 1) + '\n');
  console.log('SUMMARY ' + JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.median ?? v]))));
}
