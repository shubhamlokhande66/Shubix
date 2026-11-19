import { describe, expect, it } from "vitest";
import { songAnalysis } from "@mobile/core/engine/studio/song";
import { reviewAutonomousEdit } from "@mobile/video-engine";
import { createNativeEngine } from "../lib/nativeEngine";
import { windowStats } from "../engine/brain/pure";

// The app's own engine with no page, as in native-engine.test.ts, on clips made up with known faults: each has a
// stretch that is too dark to see or soft, and they differ in length and movement. The edit must review itself and
// repair what has one right answer: every clip the creator gave is in the Reel, and no shot is dark when unused
// footage that can be seen was there.
const SR = 22050;
function song(seconds: number) {
  const n = seconds * SR, x = new Float32Array(n);
  for (let b = 0; b * 0.5 < seconds; b++) for (let i = 0; i < 2000 && b * 11025 + i < n; i++) x[b * 11025 + i] = Math.exp(-i / 300) * Math.sin(i * 0.05);
  return x;
}
type Sample = { t: number; m: number; b: number; sh: number };
type Shot = { start: number; end: number; src: number; in: number; scaleR: number; sp: { pos: (l: number) => number }; byDir?: boolean };
type State = { edit: Shot[]; sources: { dur: number; shMed?: number; samples: Sample[] }[]; beats: number[]; editTakes: { tried: number; kept: number; fixedDark: number; addedClips: number } };

export function world(nClips: number, seed: number, o: { pop?: boolean; face?: { x: number; y: number; s: number }; still?: boolean } = {}) {
  let r = seed; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const mono = song(30), clips: Record<string, { dur: number; samples: Record<string, number>[] }> = {}, paths: { path: string; name: string }[] = [];
  for (let c = 0; c < nClips; c++) {
    const dur = 3 + Math.floor(rnd() * 8), n = dur * 10, badA = Math.floor(rnd() * n), badLen = Math.floor(n * (0.2 + 0.4 * rnd())), dark = rnd() < 0.5, base = 0.2 + rnd() * 0.6;
    const samples = Array.from({ length: n }, (_, i) => { const bad = i >= badA && i < badA + badLen;
      return { t: i / 10, m: o.still && i < n / 2 ? 0.0005 : Math.max(0.005, base * (0.5 + rnd())) * 0.1, b: bad && dark ? 0.03 : 0.35 + 0.3 * rnd(), cx: 0.5, sh: bad && !dark ? 20 : 90 + 30 * rnd(), sx: 0.5, sy: 0.5, sw: 0.2, gx: 0, gy: 0, ax: 0.5, ay: 0.5, aw: 0.3 }; });
    clips[`/c${c}.mp4`] = { dur, samples }; paths.push({ path: `/c${c}.mp4`, name: `c${c}.mp4` });
  }
  const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => String(body), json: async () => body, arrayBuffer: async () => body as ArrayBuffer });
  const fetcher = async (url: string, init?: { method?: string; body?: unknown }) => {
    const u = new URL(url), path = u.pathname.slice(1), p = u.searchParams.get("p") ?? "";
    if (path === "sound") { const out = new ArrayBuffer(8 + mono.byteLength), v = new DataView(out); v.setInt32(0, SR, true); v.setInt32(4, 1, true); new Float32Array(out, 8).set(mono); return ok(out); }
    if (path === "song") {
      const b = init!.body as Uint8Array, len = new DataView(b.buffer, b.byteOffset).getUint32(0, true), o = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + len)));
      const m = new Float32Array(b.slice(4 + len).buffer), a = songAnalysis(m, o.sr, o);
      return ok({ ...a, rmsF: Array.from(a.rmsF as unknown as Float32Array), pfArr: Array.from(a.pfArr as unknown as Float32Array), onEnv: Array.from(a.onEnv as unknown as Float64Array) });
    }
    if (path === "probe") return ok({ dur: clips[p].dur, w: 1080, h: 1920 });
    if (path === "scan") return ok(`0.5\n${JSON.stringify({ samples: clips[p].samples, scenes: [] })}\n`);
    // a face in every frame (BlazeFace's finds, as ClipFaces.kt gives them), when asked
    if (path === "faces") return ok(`${JSON.stringify(o.face ? Array.from({ length: clips[p].dur * 5 }, (_, i) => ({ t: i / 5, rects: [{ ...o.face, sc: 0.9 }] })) : [])}\n`);
    // the subject pop (SubjectPop.kt), when asked: a car-like subject in the middle of every frame, cut out as a PNG
    if (o.pop && path === "popmask") { const n = 320 * 320, b = new Uint8Array(1 + n * 5); b[0] = 1;
      for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) b[1 + y * 320 + x] = x > 60 && x < 260 && y > 150 && y < 250 ? 250 : 5;
      b.fill(120, 1 + n); return ok(b.buffer); }
    if (o.pop && path === "popcut") return ok({ path: "/pop.png", w: 640, h: 320 });
    return { ok: false, status: 404, text: async () => "no", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return { e: createNativeEngine({ base: "http://phone", key: "k", apiWait: 0, fetch: fetcher }), paths, clips };
}
async function reelOf(nClips: number, seed: number) {
  const w = world(nClips, seed);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
  const ES = (w.e.host() as unknown as { ES: State }).ES, t0 = ES.edit[0].start;
  let black = 0;   // seconds of black the Reel shows (parts of clips that are black)
  const shots = ES.edit.map((e) => { const s = ES.sources[e.src], need = e.sp.pos(e.end - e.start) * (e.scaleR || 1), st = windowStats(s, e.in, e.in + Math.max(need, 0.05));
    black += (st.dark || 0) * need;
    return { start: e.start - t0, end: e.end - t0, sourceIndex: e.src, sourceStart: e.in, sourceEnd: e.in + need, sharpness: st.sh / (s.shMed || 1), brightness: st.b, darkSeconds: (st.dark || 0) * Math.max(need, 0.05) }; });
  const review = reviewAutonomousEdit({ shots, beats: ES.beats.map((b) => b - t0), duration: ES.edit[ES.edit.length - 1].end - t0, sourceCount: ES.sources.length, sourceDurations: ES.sources.map((s) => s.dur), cutLead: 1 / 30 });
  return { ES, review, black, sig: ES.edit.map((e) => `${e.src}@${e.in.toFixed(3)}`).join(",") };
}
const count = (r: Awaited<ReturnType<typeof reelOf>>, code: string) => r.review.issues.filter((i) => i.code === code).length;

describe("the edit repairs what its review finds", () => {
  it("every clip the creator gave is in the Reel, when there are shots enough", async () => {
    for (const [n, seed] of [[12, 19], [12, 33], [20, 27], [20, 41]] as const) {
      const r = await reelOf(n, seed);
      expect(r.ES.edit.length).toBeGreaterThan(n);
      expect(new Set(r.ES.edit.map((e) => e.src)).size).toBe(n);
      expect(r.ES.editTakes.addedClips).toBeGreaterThan(0);   // these Reels left clips out before the repair
      expect(count(r, "clips-unused")).toBe(0);
    }
  });
  it("bringing a clip in never shows footage twice, puts two parts of a clip in a row, or brings a dark or soft moment", async () => {
    for (const [n, seed] of [[12, 19], [20, 27]] as const) {
      const r = await reelOf(n, seed);
      for (const code of ["footage-repeated", "same-clip-jump", "dark-shot", "soft-shot", "footage-overrun"]) expect(count(r, code)).toBe(0);
      expect(r.review.status).not.toBe("fail");
    }
  });
  it("shows no black: a clip's black part is kept out though the moment around it is bright", async () => {
    // every clip here has a stretch that is black or soft; before this, a Reel of these showed about a second of black
    for (const [n, seed] of [[12, 19], [12, 33], [20, 27], [20, 41]] as const) {
      const r = await reelOf(n, seed);
      expect(r.black).toBe(0);
      expect(count(r, "dark-shot")).toBe(0);
    }
  });
  it("keeps the cuts on the beat: a repair changes what a shot shows, never when it cuts", async () => {
    const r = await reelOf(12, 19);
    expect(r.review.metrics.beatSync!.ratio).toBe(1);
  });
  it("gives its review to the app: the same review as measured here, with the takes and repairs", async () => {
    const w = world(12, 19);
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    const got = (await w.e.call("review")) as { review: { version: number; score: number; status: string; metrics: { shots: number; clipCoverage: { used: number } } } | null; takes: { addedClips: number } | null };
    const r = await reelOf(12, 19);
    expect(got.review!.version).toBe(1);
    expect(got.review!.metrics.shots).toBe(r.ES.edit.length);
    expect(got.review!.metrics.clipCoverage.used).toBe(12);
    expect(got.review!.status).not.toBe("fail");
    expect(got.takes!.addedClips).toBe(r.ES.editTakes.addedClips);
  });
  it("has no review before there is an edit", async () => {
    const w = world(3, 5);
    expect(((await w.e.call("review")) as { review: unknown }).review).toBeNull();
  });
  it("makes the same Reel again from the same clips and song", async () => {
    const a = await reelOf(12, 33), b = await reelOf(12, 33);
    expect(a.sig).toBe(b.sig);
  });
  it("keeps a black part out when footage is little too, where room for it is", async () => {
    // 6 clips for 50 shots: this Reel showed a black part before the scorer counted black inside a moment
    const r = await reelOf(6, 48);
    expect(count(r, "dark-shot")).toBe(0);
    expect(r.black).toBe(0);
  });
});

describe("In my order: a clip that opens on black", () => {
  // clip 2 is black for its first two fifths (a fade in, the lens covered); the others are as before
  async function inOrder(nClips: number, seed: number) {
    const w = world(nClips, seed), c = w.clips["/c2.mp4"], blackUntil = c.dur * 0.4;
    c.samples.forEach((x) => { x.b = x.t < blackUntil ? 0.02 : 0.5; x.sh = 100; });
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths });
    const h = w.e.host() as unknown as { ES: State & { seqOn: boolean }; brain: { makeEditNow: () => void } };
    h.ES.seqOn = true; h.brain.makeEditNow();
    return { edit: h.ES.edit, blackUntil, nClips };
  }
  it("shows every clip once, in the creator's order", async () => {
    for (const [n, seed] of [[8, 5], [12, 19], [5, 3]] as const) {
      const r = await inOrder(n, seed);
      expect(r.edit.map((e) => e.src)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
  it("starts that clip at its first picture, and plays it slower rather than show the black", async () => {
    for (const [n, seed] of [[8, 5], [8, 9], [12, 19], [5, 3], [20, 27]] as const) {
      const r = await inOrder(n, seed), shot = r.edit.find((e) => e.src === 2)!;
      expect(shot.in).toBeGreaterThanOrEqual(r.blackUntil - 0.11);   // (readings are 0.1 s apart)
      expect(shot.scaleR).toBeGreaterThanOrEqual(0.25);              // never slower than the engine's own floor
      expect(shot.scaleR).toBeLessThanOrEqual(1);
    }
  });
});
