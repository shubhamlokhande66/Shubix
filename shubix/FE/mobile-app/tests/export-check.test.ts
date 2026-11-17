import { describe, expect, it } from "vitest";
import { checkExportedReel, type ExportSample } from "@mobile/video-engine";
import { world } from "./edit-repairs.test";

// The finished video read back (the phone's clip scan) and checked against the edit that made it (exportCheck.ts).
const want = { dur: 10, cuts: [2, 4, 6, 8] };
/** a scan of a video: a sample every 0.1 s, light `b` and movement `m` from the given functions */
const scan = (dur: number, b: (t: number) => number, m: (t: number) => number = () => 0.004): ExportSample[] =>
  Array.from({ length: Math.round(dur * 10) }, (_, i) => ({ t: i / 10, b: b(i / 10), m: m(i / 10) }));
const read = (samples: ExportSample[], o: Partial<{ dur: number; scenes: { t0: number; t1: number }[] }> = {}) => ({ dur: o.dur ?? 10, w: 1080, h: 1920, samples, scenes: o.scenes ?? [] });
const codes = (v: ReturnType<typeof checkExportedReel>) => v.problems.map((p) => p.code);

describe("the exported video checked against its edit", () => {
  it("passes a video that shows what the edit planned", () => {
    expect(checkExportedReel(read(scan(10, () => 0.4)), want)).toEqual({ ok: true, retake: false, problems: [] });
  });
  it("finds a video that could not be read or came out short, and makes it again", () => {
    expect(checkExportedReel({ dur: 0, w: 0, h: 0, samples: [] }, want)).toMatchObject({ ok: false, retake: true, problems: [{ code: "unreadable" }] });
    const short = checkExportedReel(read(scan(7, () => 0.4), { dur: 7 }), want);
    expect(codes(short)).toEqual(["length"]);
    expect(short.retake).toBe(true);
  });
  it("finds black where the edit shows footage", () => {
    const v = checkExportedReel(read(scan(10, (t) => (t >= 4.5 && t < 5.6 ? 0.01 : 0.4))), want);
    expect(codes(v)).toEqual(["black"]);
    expect(v.problems[0].at).toBeCloseTo(4.5, 1);
  });
  it("keeps the black the edit made: a dark shot, a dip at a cut, the end's fade, a moment shorter than 0.4 s", () => {
    const dark = checkExportedReel(read(scan(10, (t) => (t >= 2 && t < 4 ? 0.02 : 0.4))), { ...want, dark: [[2, 4]] });
    expect(dark.ok).toBe(true);
    const dip = checkExportedReel(read(scan(10, (t) => (Math.abs(t - 6) <= 0.3 ? 0.01 : 0.4))), want);
    expect(dip.ok).toBe(true);
    const fade = checkExportedReel(read(scan(10, (t) => (t > 9.1 ? 0.01 : 0.4))), want);
    expect(fade.ok).toBe(true);
    const blink = checkExportedReel(read(scan(10, (t) => (t >= 5 && t < 5.3 ? 0.01 : 0.4))), want);
    expect(blink.ok).toBe(true);
  });
  it("finds a picture that stops over the edit's cuts (a stalled decoder)", () => {
    const v = checkExportedReel(read(scan(10, () => 0.4, (t) => (t >= 3 && t < 7 ? 0 : 0.004))), want);
    expect(codes(v)).toEqual(["frozen"]);
    expect(v.retake).toBe(true);
  });
  it("keeps a still shot: a photo held between cuts, or still shots the scan saw cut", () => {
    const photo = checkExportedReel(read(scan(10, () => 0.4, (t) => (t >= 2.1 && t < 3.9 ? 0 : 0.004))), want);
    expect(photo.ok).toBe(true);
    const cutSeen = checkExportedReel(read(scan(10, () => 0.4, (t) => (t >= 3 && t < 7 ? 0 : 0.004)), { scenes: [{ t0: 3.95, t1: 4.05 }, { t0: 5.95, t1: 6.05 }] }), want);
    expect(cutSeen.ok).toBe(true);
  });
});

describe("the app's engine reads the exported video back", () => {
  type Shot = { start: number; end: number };
  async function made() {
    const w = world(12, 19);
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    const edit = (w.e.host() as unknown as { ES: { edit: Shot[] } }).ES.edit, t0 = edit[0].start, dur = edit[edit.length - 1].end - t0;
    const cuts = edit.slice(1).map((e) => e.start - t0);
    /** the exported file as the scan reads it: its light, and movement that jumps at each cut unless `frozen` */
    const file = (len: number, frozen?: [number, number]) => {
      const samples = Array.from({ length: Math.round(len * 10) }, (_, i) => { const t = i / 10, still = frozen && t >= frozen[0] && t < frozen[1];
        return { t, b: 0.4, m: still ? 0 : cuts.some((c) => Math.abs(c - t) < 0.06) ? 0.05 : 0.004, cx: 0.5, sh: 100, sx: 0.5, sy: 0.5, sw: 0.2, gx: 0, gy: 0, ax: 0.5, ay: 0.5, aw: 0.3 }; });
      w.clips["/out.mp4"] = { dur: len, samples };
    };
    const check = async () => ((await w.e.call("checkExport", { path: "/out.mp4" })) as { verdict: ReturnType<typeof checkExportedReel> | null }).verdict!;
    return { file, check, dur, cuts };
  }
  it("passes the video the edit made", async () => {
    const r = await made(); r.file(r.dur);
    expect(await r.check()).toEqual({ ok: true, retake: false, problems: [] });
  });
  it("asks for another take when the picture stops over cuts or the file is short", async () => {
    const r = await made(), c = r.cuts.find((x) => x > 3)!;
    r.file(r.dur, [c - 1, c + 1.5]);
    expect((await r.check()).problems.map((p) => p.code)).toContain("frozen");
    r.file(r.dur * 0.7);
    const short = await r.check();
    expect(short.problems.map((p) => p.code)).toContain("length");
    expect(short.retake).toBe(true);
  });
  it("has nothing to check before there is an edit", async () => {
    const w = world(3, 5);
    expect(((await w.e.call("checkExport", { path: "/out.mp4" })) as { verdict: unknown }).verdict).toBeNull();
  });
});
