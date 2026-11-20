import { describe, expect, it } from "vitest";
import { songAnalysis } from "@mobile/core/engine/studio/song";
import { shortReelFor, oneTakeLength } from "@mobile/video-engine";
import { createNativeEngine } from "../lib/nativeEngine";

// One 4 s clip and a song, in the app's own engine with no page: the Reel is made (nobody is sent back for more
// clips), the song decides how. A slow song: slow motion, about twice the clip. A fast song: as filmed.
const SR = 22050;
function song(seconds: number, bpm: number) {
  const n = seconds * SR, x = new Float32Array(n), step = Math.round(SR * 60 / bpm);
  for (let b = 0; b * step < n; b++) for (let i = 0; i < 2000 && b * step + i < n; i++) x[b * step + i] = Math.exp(-i / 300) * Math.sin(i * 0.05);
  return x;
}
type Shot = { start: number; end: number; src: number; in: number; scaleR: number; take?: string; sp: { pos: (l: number) => number } };
function world(durs: number[], bpm: number) {
  const mono = song(30, bpm), clips: Record<string, { dur: number; samples: Record<string, number>[] }> = {}, paths: { path: string; name: string }[] = [];
  durs.forEach((dur, c) => {
    const samples = Array.from({ length: Math.round(dur * 10) }, (_, i) => ({ t: i / 10, m: 0.03 + 0.01 * ((i * 7 + c) % 5), b: 0.45, cx: 0.5, sh: 100, sx: 0.5, sy: 0.5, sw: 0.2, gx: 0, gy: 0, ax: 0.5, ay: 0.5, aw: 0.3 }));
    clips[`/c${c}.mp4`] = { dur, samples }; paths.push({ path: `/c${c}.mp4`, name: `c${c}.mp4` });
  });
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
    if (path === "faces") return ok("[]\n");
    return { ok: false, status: 404, text: async () => "no", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return { e: createNativeEngine({ base: "http://phone", key: "k", apiWait: 0, fetch: fetcher }), paths, durs };
}
/** the create flow's own steps (app/create/[kind].tsx): the footage is asked, the Reel's length set by it, the Reel made */
async function reelOf(durs: number[], bpm: number) {
  const w = world(durs, bpm);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths });
  const f = await w.e.call("footage") as { have: number; exact: number; period: number };
  const short = shortReelFor(f.exact, f.period, 30);
  // (one clip of 5 s and more is one take: its Reel is longer than the clip, as the create flow sets it)
  const f1 = f as typeof f & { clips: number };
  if (short) await w.e.call("choose", { length: f1.have >= 5 && f1.clips === 1 ? Math.min(30, Math.max(f1.have, oneTakeLength(f1.exact))) : short.len });
  await w.e.call("ready");
  const edit = (w.e.host() as unknown as { ES: { edit: Shot[] } }).ES.edit, len = edit[edit.length - 1].end - edit[0].start;
  const used = edit.map((s) => ({ src: s.src, a: s.in, b: s.in + s.sp.pos(s.end - s.start) * (s.scaleR || 1), time: s.end - s.start }));
  return { f, short, edit, len, used };
}
describe("a Reel from one short clip", () => {
  it("a 4 s clip under a slow song: a slow motion Reel of about 8 s, not 'add more clips'", async () => {
    const r = await reelOf([4], 80);
    expect(r.f.have).toBeLessThan(5);
    expect(r.f.period).toBeCloseTo(0.75, 1);
    expect(r.short!.speed).toBe(0.5);
    expect(r.len).toBeGreaterThan(6.5); expect(r.len).toBeLessThanOrEqual(8.2);
    const video = r.used.reduce((t, u) => t + (u.b - u.a), 0);
    expect(video / r.len).toBeGreaterThan(0.44); expect(video / r.len).toBeLessThan(0.62);   // about half speed, all through
  });
  it("a 4 s clip under a fast song: as filmed, as long as the clip", async () => {
    const r = await reelOf([4], 140);
    expect(r.short!.speed).toBeGreaterThan(0.95);
    expect(r.len).toBeGreaterThan(3); expect(r.len).toBeLessThanOrEqual(4.1);
  });
  for (const [name, durs, bpm] of [["one clip, slow song", [4], 80], ["one clip, fast song", [4], 140], ["one clip, a song in between", [3.2], 112], ["two short clips, slow song", [2.2, 2.4], 84]] as const) {
    it(`${name}: the clip plays forward once, never past its end, no moment twice`, async () => {
      const r = await reelOf([...durs], bpm);
      expect(r.short).not.toBeNull();
      for (const u of r.used) { expect(u.a).toBeGreaterThanOrEqual(-0.001); expect(u.b).toBeLessThanOrEqual(r.used.length && durs[u.src] + 0.001); }
      for (let i = 1; i < r.used.length; i++) { const p = r.used[i - 1], u = r.used[i];
        if (u.src === p.src) expect(u.a).toBeGreaterThanOrEqual(p.b - 0.05); else expect(u.src).toBeGreaterThan(p.src); }
      for (const u of r.used) expect((u.b - u.a) / u.time).toBeGreaterThan(0.38);   // no shot slower than the engine's floor
    });
  }
  it("under 2 s of good video: no Reel is offered", async () => {
    const w = world([1.6], 80);
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths });
    const f = await w.e.call("footage") as { exact: number; period: number };
    expect(shortReelFor(f.exact, f.period, 30)).toBeNull();
  });
});

// One clip of 5 s and more is one take, as a creator edits it: as filmed up to the song's moment, slow motion from there.
describe("one clip is one take", () => {
  for (const [name, dur, bpm] of [["a 12 s clip, 120 BPM", 12, 120], ["a 20 s clip, 100 BPM", 20, 100], ["a 9 s clip, 140 BPM", 9, 140], ["a 6 s clip, 120 BPM", 6, 120]] as const) {
    it(`${name}: as filmed, then slow motion, running on without a jump, and a Reel longer than the clip`, async () => {
      const r = await reelOf([dur], bpm);
      const at = r.edit.findIndex((s) => s.take === "slow");
      expect(at).toBeGreaterThan(0);                                             // it begins as filmed
      expect(r.edit.slice(0, at).every((s) => s.take === "filmed")).toBe(true);
      expect(r.edit.slice(at).every((s) => s.take === "slow")).toBe(true);        // and stays slow to the end
      const slowFrom = r.edit[at].start - r.edit[0].start;
      expect(slowFrom).toBeGreaterThanOrEqual(1.5); expect(r.len - slowFrom).toBeGreaterThanOrEqual(2);
      r.used.forEach((u, i) => {
        const speed = (u.b - u.a) / u.time;
        if (i < at) { expect(speed).toBeGreaterThan(0.84); expect(speed).toBeLessThan(1.02); } else { expect(speed).toBeGreaterThan(0.42); expect(speed).toBeLessThan(0.52); }
        if (i) expect(Math.abs(u.a - r.used[i - 1].b)).toBeLessThan(0.02);        // one take: no moment left out, none twice
        expect(u.b).toBeLessThanOrEqual(dur + 0.001);
      });
      expect(r.len).toBeGreaterThan(dur * 1.1);
    });
  }
  it("a Reel one clip fills: the clip's length and its slow part's half speed", () => {
    expect(oneTakeLength(7)).toBe(10); expect(oneTakeLength(11.85)).toBe(16); expect(oneTakeLength(20, 25)).toBe(25); expect(oneTakeLength(NaN)).toBe(0);
  });
});

// "clip slow kar" typed to Shubix: real slow motion on every shot, at once, with no Shubix AI ("slow" used to switch to
// the Smooth style only, and the answer still said Done). "normal speed" takes it back.
describe("slow motion asked for in words", () => {
  const speeds = (e: ReturnType<typeof world>["e"]) => { const edit = (e.host() as unknown as { ES: { edit: Shot[] } }).ES.edit;
    return edit.map((s) => s.sp.pos(s.end - s.start) * (s.scaleR || 1) / (s.end - s.start)); };
  for (const [name, durs, words] of [["three clips", [8, 9, 7], "clip slow kar"], ["three long clips (their shots joined, one a clip)", [16, 18, 15], "clip slow kar"], ["one clip", [14], "make it slow motion"], ["three clips, in Marathi", [8, 9, 7], "video हळू कर"]] as const) {
    it(`${name}, "${words}": every shot at half speed, and "normal speed" takes it back`, async () => {
      const w = world([...durs], 120);
      await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths });
      await w.e.call("choose", { order: "order" });   // "In my order", as the website has it by default: long clips' shots are joined there
      await w.e.call("ready");
      const before = speeds(w.e);
      // not slow motion (0.5): 24 s of clips stretched over a 30 s song play at about 0.8 (0.75-0.79 since the song is read at
      // its true beat, 0.5 s: song.ts resamples to 44.1 kHz; 0.511 s before)
      expect(Math.max(...before)).toBeGreaterThan(0.7);
      const said = await w.e.call("chat", { text: words }) as { answer: string };
      expect(said.answer).toMatch(/slow motion/);
      const slow = speeds(w.e);
      for (const v of slow) { expect(v).toBeGreaterThan(0.2); expect(v).toBeLessThanOrEqual(0.51); }
      const again = await w.e.call("chat", { text: words }) as { answer: string };
      expect(again.answer).toMatch(/already in slow motion/);
      const back = await w.e.call("chat", { text: "normal speed" }) as { answer: string };
      expect(back.answer).toMatch(/normal speed again/);
      expect(Math.max(...speeds(w.e))).toBeGreaterThan(0.7);
    });
  }
  it("words that are not about slow motion change no speed", async () => {
    const w = world([8, 9, 7], 120);
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    const before = speeds(w.e).join(",");
    for (const t of ["hello", "what is a slow song?".replace("slow song", "calm song"), "thanks"]) await w.e.call("chat", { text: t });
    expect((w.e.host() as unknown as { ES: { slowAll: boolean } }).ES.slowAll).toBe(false);
    expect(speeds(w.e).join(",")).toBe(before);
  });
});
