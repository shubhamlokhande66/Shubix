import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

/** My brand and the finish in the Android brain (core.ts brandFinish / finishSet, as the website's engine.ts): the logo in
 * the corner, the end card, cinematic bars, the colour flash and B&W until the drop, and what the phone draws. */
type Layer = { brand?: string; role?: string; finish?: string; t0: number; t1: number; pulses?: unknown[] };
type ES = { layers: Layer[]; overlays: { brand?: string; text: string }[]; edit: { bw?: boolean; cs?: { sat?: number } }[]; buf: { duration: number } };
async function reel(seed = 7) {
  const w = world(4, seed);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
  return { call: w.e.call, ES: (w.e.host() as unknown as { ES: ES }).ES };
}

describe("My brand on Android", () => {
  it("puts the logo in the corner and ends on the end card", async () => {
    const { call, ES } = await reel();
    await call("brandSet", { handle: "vp cinematic", logoPath: "/logo.png", logoW: 400, logoH: 200, mark: true, end: true });
    const D = ES.buf.duration, mark = ES.layers.find((L) => L.role === "mark")!, end = ES.layers.filter((L) => L.role === "end");
    expect(mark.t0).toBe(0);
    expect(end.length).toBe(2);                         // the dark and the logo
    expect(D - end[0].t0).toBeGreaterThanOrEqual(2.3); expect(D - end[0].t0).toBeLessThanOrEqual(4.6);
    expect(mark.t1).toBeCloseTo(end[0].t0);
    expect(ES.overlays.filter((o) => o.brand === "auto").map((o) => o.text)).toEqual(["@vpcinematic", "Follow for more"]);
    const list = await call("layerList") as { native: { kind: string; path: string } | null; brand: string | null }[];
    expect(list.filter((x) => x.brand).map((x) => x.native?.kind)).toEqual(["photo", "shade", "photo"]);
  });
  it("deleting the end card keeps it away; no brand, nothing", async () => {
    const { call, ES } = await reel();
    await call("brandSet", { handle: "@me", logoPath: null, mark: true, end: true });
    expect(ES.layers.filter((L) => L.role === "end").length).toBe(1);   // no logo: the dark and the words
    await call("layerSelect", { index: ES.layers.findIndex((L) => L.role === "end") }); await call("layerDelete");
    expect(ES.layers.some((L) => L.brand) || ES.overlays.some((o) => o.brand)).toBe(false);
    await call("brandSet", {});
    expect(ES.layers.some((L) => L.brand)).toBe(false);
  });
});

describe("the finish on Android", () => {
  it("cinematic bars and the colour flash are layers the phone draws, on and off", async () => {
    const { call, ES } = await reel();
    expect((await call("finish", { what: "bars", on: true }) as { ok: boolean }).ok).toBe(true);
    const r = await call("finish", { what: "tint", on: true }) as { ok: boolean; on: { bars: boolean; tint: boolean } };
    expect(r.ok).toBe(true); expect(r.on.tint).toBe(true); expect(ES.layers.find((L) => L.finish === "tint")!.pulses!.length).toBeGreaterThan(0);
    const list = await call("layerList") as { native: { kind: string; ratio?: number } | null; finish: string | null }[];
    expect(list.find((x) => x.finish === "bars")!.native).toMatchObject({ kind: "bars", ratio: 2.39 });
    await call("finish", { what: "bars", on: false });
    expect(ES.layers.some((L) => L.finish === "bars")).toBe(false);
  });
  it("black and white until the drop greys the shots before it, and gives their colour back", async () => {
    const { call, ES } = await reel();
    const S = ES as unknown as { cuts: number[]; cutType: string[]; edit: { start: number }[] };
    S.cuts = [S.edit[0].start + 6]; S.cutType = ["drop"];   // a drop 6 s in (the test song has none)
    const r = await call("finish", { what: "bw", on: true }) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(ES.edit.filter((e) => e.bw).every((e) => e.cs?.sat === -1)).toBe(true);
    await call("finish", { what: "bw", on: false });
    expect(ES.edit.some((e) => e.bw)).toBe(false);
  });
});
