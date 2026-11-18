// @ts-nocheck: a benchmark run by hand on a computer (Node's files, ffmpeg, a plain .mjs script), skipped without HUMAN_REELS;
// the app's typecheck has no Node types
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// a plain .mjs script (the reference Reels' measure: the song's beats and drops, the picture's cuts)
import { measure } from "../../web-app/scripts/studio-references/analyze.mjs";
import { createEditBrain } from "../engine/brain/edit";
import { storyRoles, type StoryRole } from "@mobile/video-engine";

/**
 * The rebuild test: how often Shubix would put a shot where a human editor put it, measured on human-edited Reels alone
 * (no raw footage needed). Each human Reel is cut at its own cuts into its shots; every shot is read the way the phone
 * reads a clip (the brain's own frameStats: movement, light, sharpness; faces from `<reel>.faces.json` when present).
 * Then for every place in the Reel (the opening, the setup, the drops, the last shot...) Shubix's own scorer
 * (scoreWindow, the code that picks moments on the phone) ranks all of the Reel's shots, and we look where the shot the
 * human put there lands: 100% = Shubix's first choice, 0% = its last, 50% = what a random pick gets.
 *
 * It measures placement (which moment goes where), not choosing from raw footage: every shot here was already one the
 * human kept. The story nudges (story.ts) are measured on and off. Off by default; run it with the Reels' folder:
 *   HUMAN_REELS=/path/to/reels npx vitest run tests/human-rebuild.test.ts      (ffmpeg on the PATH)
 * AI_DIR=dir adds Shubix AI's look at each shot (<reel>.ai.json: rankShots' answers, one per shot). OUT=file.json also writes every Reel's numbers; ONLY=name.mp4 measures one Reel (low-memory machines: one run per Reel); CACHE=dir keeps each Reel's reading. The videos are never put in the repository.
 */
const DIR = process.env.HUMAN_REELS;
/** the report, as it is made (to the terminal, and to REPORT=file when given) */
const say = (t: string) => { process.stdout.write(t + "\n"); if (process.env.REPORT) fs.appendFileSync(process.env.REPORT, t + "\n"); };
const FPS = 10, SW = 48, SH = 27, TAIL = 0.15;
type Row = Record<string, number> & { t: number };
type Src = { dur: number; shMed: number; samples: Row[]; faces: { t: number; n: number; fx: number; fy: number; fs: number }[]; scenes: never[]; at: number };

function frames(file: string, w: number, h: number) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", file, "-an", "-vf", `fps=${FPS},scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 30 });
  const n = w * h * 4, out: Uint8ClampedArray[] = [];
  for (let k = 0; (k + 1) * n <= r.stdout.length; k++) out.push(new Uint8ClampedArray(r.stdout.buffer, r.stdout.byteOffset + k * n, n));
  return out;
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** one human Reel, read once: with CACHE=dir its reading is kept there and used again (a new rule is then measured in
 * seconds, not an hour) */
function readReel(file: string) {
  const at = process.env.CACHE ? path.join(process.env.CACHE, path.basename(file) + ".read.json") : "";
  const sp = { pos: (l: number) => l, at: () => 1 };
  const keep = (r: ReturnType<typeof readReelNow>) => { if (at) fs.writeFileSync(at, JSON.stringify({ ...r, shots: r.shots.map((x) => ({ ...x, samples: x.samples.map(({ t, m, b, sh, cx, gx, gy, sat, warm }) => ({ t, m, b, sh, cx, gx, gy, sat, warm })) })) })); };
  if (at && fs.existsSync(at)) {
    const r = JSON.parse(fs.readFileSync(at, "utf8")); r.slots.forEach((x: Record<string, unknown>) => { x.sp = sp; });
    if (r.shots.length && typeof r.shots[0].samples[0]?.warm !== "number") { toneShots(file, r.shots); keep(r); }
    return r as ReturnType<typeof readReelNow>;
  }
  const r = readReelNow(file);
  keep(r);
  return r;
}
/** each shot's warmth and colour (red against blue, as frameTone reads it), for a cache made before the flow: one quick
 * pass at 16x9, the shot's mean put on all of its samples */
function toneShots(file: string, shots: Src[]) {
  const W = 16, H = 9, F = 5, n = W * H * 3, p = spawnSync("ffmpeg", ["-loglevel", "error", "-i", file, "-an", "-vf", `fps=${F},scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 28 });
  const frames = Math.floor(p.stdout.length / n);
  for (const s of shots) {
    let warm = 0, sat = 0, c = 0;
    for (let k = Math.ceil(s.at * F); k < frames && k / F < s.at + s.dur - 0.05; k++) for (let i = 0; i < W * H; i++) {
      const o = k * n + i * 3, r = p.stdout[o] / 255, g = p.stdout[o + 1] / 255, b = p.stdout[o + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      warm += r - b; if (mx > 0.04) sat += (mx - mn) / mx; c++;
    }
    s.samples.forEach((x) => { x.warm = c ? warm / c : 0; x.sat = c ? sat / c : 0; });
  }
}
/** one human Reel: its shots as clips, and the slots they fill */
function readReelNow(file: string) {
  const T0 = Date.now(), m = measure(file), T1 = Date.now(), dur: number = m.dur, cuts: number[] = m.cuts, drops: number[] = m.drops || [];
  const brain = createEditBrain({}, { SW, SH, FEAT: 64 + 16 + 40 }) as any;
  const small = frames(file, SW, SH), big = frames(file, 128, 72), n = Math.min(small.length, big.length);
  const facesFile = file + ".faces.json", faces = fs.existsSync(facesFile) ? JSON.parse(fs.readFileSync(facesFile, "utf8")) : [];
  const edges = [0, ...cuts, dur], shots: Src[] = [];
  for (let j = 0; j + 1 < edges.length; j++) {
    const s = edges[j], e = edges[j + 1];
    let prev: Float32Array | null = null; const S: Row[] = [];
    for (let k = Math.ceil(s * FPS); k < n && k / FPS < e - 0.02; k++) { const f = brain.frameStats(small[k], big[k], prev); prev = f.lum; S.push({ ...f.row, t: k / FPS - s }); }
    if (S.length > 1) S[0].m = S[1].m;
    const samples = S.map((x, i) => ({ ...x, m: (S[Math.max(0, i - 1)].m + x.m + S[Math.min(S.length - 1, i + 1)].m) / 3 }));
    const F = faces.filter((f: { t: number }) => f.t >= s && f.t < e).map((f: { t: number }) => ({ ...f, t: f.t - s }));
    shots.push({ dur: e - s, shMed: median(samples.map((x) => x.sh)) || 1, samples, faces: F, scenes: [], at: s });
  }
  // a shot is kept when it can be judged: long enough to read, and not the black end card
  say(`  read ${path.basename(file)}: song and cuts ${((T1 - T0) / 1000).toFixed(0)} s, frames ${((Date.now() - T1) / 1000).toFixed(0)} s`);
  const kept = shots.filter((x) => x.dur >= 0.4 && x.samples.length >= 3 && mean(x.samples.map((r) => r.b)) >= 0.08);
  const slots = kept.map((x) => ({ start: x.at, end: x.at + x.dur, type: drops.some((d) => Math.abs(d - x.at) < 0.15) ? "drop" : "cut", sp: { pos: (l: number) => l, at: () => 1 } }));
  return { file: path.basename(file), dur, shots: kept, slots };
}

/** for each slot, where the human's own shot ranks among the Reel's shots by Shubix's scorer (1 = first, 0 = last) */
function rankAll(reel: ReturnType<typeof readReel>, story: boolean, ai = false, flow?: "base" | "on") {
  const ES: Record<string, unknown> = { seed: 1, plan: reel.slots, sources: reel.shots, mode: story ? "auto" : "copy", aiOn: ai };
  const b = createEditBrain(ES, { SW, SH }) as any, gmax = Math.max(1e-6, ...reel.shots.flatMap((s) => s.samples.map((x) => x.m)));
  const look = (s: Src) => ({ m: mean(s.samples.map((x) => x.m)) / gmax, b: mean(s.samples.map((x) => x.b)), warm: mean(s.samples.map((x) => x.warm ?? 0)) });
  const best = (i: number, src: Src) => {
    const need = Math.max(0.1, Math.min(reel.slots[i].end - reel.slots[i].start, src.dur - TAIL)); let sc = -Infinity;
    const near = flow === "on" && i > 0 ? [look(reel.shots[i - 1])] : undefined;
    for (let a = 0; a <= src.dur - need + 1e-6; a += 0.1) sc = Math.max(sc, b.scoreWindow(i, src, a, need, gmax, near).sc);
    return sc;
  };
  return reel.slots.map((_, i) => {
    const sc = reel.shots.map((src) => best(i, src)), mine = sc[i], others = sc.filter((_, j) => j !== i && !(flow && j === i - 1));
    return others.length ? others.reduce((n, x) => n + (x < mine ? 1 : x === mine ? 0.5 : 0), 0) / others.length : 0.5;
  });
}

/** what the shot the human put in each part of the story is like, against the Reel's shots on average */
function looks(reel: ReturnType<typeof readReel>) {
  const gmax = Math.max(1e-6, ...reel.shots.flatMap((s) => s.samples.map((x) => x.m)));
  return reel.shots.map((s) => {
    const F = s.faces, on = F.filter((f) => f.n);
    return { motion: mean(s.samples.map((x) => x.m)) / gmax, light: mean(s.samples.map((x) => x.b)), face: F.length ? on.length / F.length : 0, faceSize: on.length ? mean(on.map((f) => f.fs)) : 0, secs: s.dur };
  });
}

describe.skipIf(!DIR)("rebuild test: Shubix's picks against human-edited Reels", () => {
  it("measures every Reel in HUMAN_REELS", () => {
    const files = fs.readdirSync(DIR!).filter((f) => /\.(mp4|mov|webm)$/i.test(f) && (!process.env.ONLY || f === process.env.ONLY)).sort();   // ONLY=name: one Reel (a run per Reel needs less memory)
    const roles: StoryRole[] = ["hook", "setup", "build", "peak", "close"];
    const by: Record<string, Record<string, number[]>> = { on: {}, off: {}, ai: {}, fb: {}, fo: {} }, feat: Record<string, Record<string, number[]>> = {};
    const per: unknown[] = [];
    for (const f of files) {
      const reel = readReel(path.join(DIR!, f));
      // Shubix AI's look at each shot (AI_DIR/<reel>.ai.json: rankShots' answer per shot, in the shots' order)
      const aiFile = process.env.AI_DIR ? path.join(process.env.AI_DIR, f + ".ai.json") : "";
      const aiSeen = !!aiFile && fs.existsSync(aiFile);
      if (aiSeen) JSON.parse(fs.readFileSync(aiFile, "utf8")).forEach((a: { frames: unknown[] } | null, j: number) => { if (a && reel.shots[j]) (reel.shots[j] as Src & { ai?: unknown }).ai = a; });
      if (reel.slots.length < 4) { say(`${f}: ${reel.slots.length} shots, skipped`); continue; }
      const R = storyRoles(reel.slots.map((s) => ({ kind: s.type, start: s.start, end: s.end })));
      const on = rankAll(reel, true), off = rankAll(reel, false), withAi = aiSeen ? rankAll(reel, true, true) : null, L = looks(reel);
      // shot flow (shotFlow.ts): the shot before is the human's; the human's shot here ranked without and with the flow
      const fb = rankAll(reel, true, false, "base"), fo = rankAll(reel, true, false, "on");
      const avg = Object.fromEntries(Object.keys(L[0]).map((k) => [k, mean(L.map((x) => x[k as keyof typeof x]))]));
      R.forEach((r, i) => {
        (by.on[r] ||= []).push(on[i]); (by.off[r] ||= []).push(off[i]); if (withAi) (by.ai[r] ||= []).push(withAi[i]);
        if (i > 0) { (by.fb[r] ||= []).push(fb[i]); (by.fo[r] ||= []).push(fo[i]); }
        for (const k of Object.keys(avg)) ((feat[r] ||= {})[k] ||= []).push(L[i][k as keyof (typeof L)[0]] - avg[k]);
      });
      per.push({ file: f, shots: reel.slots.length, on: mean(on), off: mean(off), ai: withAi ? mean(withAi) : null, hook: on[0], close: on[on.length - 1], flowOff: mean(fb.slice(1)), flowOn: mean(fo.slice(1)) });
      say(`${f}: ${reel.slots.length} shots · placement ${(mean(on) * 100).toFixed(0)}% (story off ${(mean(off) * 100).toFixed(0)}%) · opening ${(on[0] * 100).toFixed(0)}% · last ${(on[on.length - 1] * 100).toFixed(0)}%`);
    }
    const pc = (a?: number[]) => (a && a.length ? `${(mean(a) * 100).toFixed(0)}%`.padStart(5) : "    -");
    say("\npart     shots   story on   story off   Shubix AI   flow off   flow on   (50% = a random pick)");
    for (const r of roles) say(`${r.padEnd(8)} ${String((by.on[r] || []).length).padStart(5)}   ${pc(by.on[r])}      ${pc(by.off[r])}      ${pc(by.ai[r])}      ${pc(by.fb[r])}     ${pc(by.fo[r])}`);
    const all = (k: "on" | "off" | "ai" | "fb" | "fo") => roles.flatMap((r) => by[k][r] || []);
    say(`${"all".padEnd(8)} ${String(all("on").length).padStart(5)}   ${pc(all("on"))}      ${pc(all("off"))}      ${pc(all("ai"))}      ${pc(all("fb"))}     ${pc(all("fo"))}`);
    // shot flow: the shot before is the human's own (as the engine has it placed), so it is no longer a choice
    const P = per as { flowOff: number; flowOn: number }[];
    say(`flow: better in ${P.filter((x) => x.flowOn > x.flowOff + 1e-9).length} Reels, worse in ${P.filter((x) => x.flowOn < x.flowOff - 1e-9).length}, of ${P.length}`);
    say("\nwhat the human's shot in each part is like, against the Reel's average (+ more, - less):");
    for (const r of roles) if (feat[r]) say(`${r.padEnd(8)} ` + Object.entries(feat[r]).map(([k, v]) => `${k} ${mean(v) >= 0 ? "+" : ""}${mean(v).toFixed(3)}`).join("  "));
    if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ per, by, feat }, null, 1));
    expect(all("on").length).toBeGreaterThan(0);
  }, 3_600_000);
});
