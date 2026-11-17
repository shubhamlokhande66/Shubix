import { describe, expect, it } from "vitest";
import { frameTone, matchTones, toneOf, type ShotTone } from "@mobile/video-engine";
import { world } from "./edit-repairs.test";

// Colour match (Shared/video-engine colorMatch.ts): shots from different clips evened out toward the Reel's middle look.
const shot = (o: Partial<ShotTone> = {}): ShotTone => ({ b: 0.45, sd: 0.2, sat: 0.3, warm: 0.02, secs: 1.5, ...o });

describe("colour match: the numbers", () => {
  it("reads a frame's colour: saturation, red minus blue, the spread of its light", () => {
    const grey = new Uint8Array(4 * 4).fill(128), red = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
    expect(frameTone(grey, 4)).toEqual({ sat: 0, warm: 0, sd: 0 });
    const r = frameTone(red, 4);
    expect(r.sat).toBe(1); expect(r.warm).toBe(1); expect(r.sd).toBe(0);
    const half = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(frameTone(half, 2).sd).toBeCloseTo(0.5, 5);
  });
  it("brings a warm, flat, dim clip toward the others, gently", () => {
    const fix = matchTones([shot(), shot(), shot(), shot({ warm: 0.12, sd: 0.12, b: 0.32 })]);
    expect(fix.slice(0, 3)).toEqual([null, null, null]);
    const f = fix[3]!;
    expect(f.warm).toBeLessThan(0);   // cooler
    expect(f.con).toBeGreaterThan(0); // more contrast
    expect(f.bri).toBeGreaterThan(0); // brighter
    expect(Math.abs(f.bri)).toBeLessThanOrEqual(0.3); expect(Math.abs(f.con)).toBeLessThanOrEqual(0.2); expect(Math.abs(f.warm)).toBeLessThanOrEqual(0.4);
  });
  it("leaves alone what should not change: a small difference, a night shot, a black-and-white one, a dim one darker", () => {
    expect(matchTones([shot(), shot({ b: 0.47, sat: 0.31 })])).toEqual([null, null]);
    const night = matchTones([shot(), shot(), shot({ b: 0.05, warm: 0.2 })]);
    expect(night[2]).toBeNull();
    const mono = matchTones([shot(), shot(), shot({ sat: 0.01 })]);
    expect(mono[2]).toBeNull();
    const dim = matchTones([shot({ b: 0.15 }), shot({ b: 0.15 }), shot({ b: 0.6 })]);
    expect(dim[0]).toBeNull();                 // the middle look is dim: the dim shots are it
    expect(dim[2]!.bri).toBeLessThan(0);       // the bright one comes down
    const dimOne = matchTones([shot({ b: 0.1 + 0.08 }), shot({ b: 0.9 }), shot({ b: 0.9 })]);
    expect(dimOne[0]?.bri ?? 0).toBeGreaterThanOrEqual(0);   // never darker
  });
  it("needs two shots that can be matched, and colour in the scan", () => {
    expect(matchTones([shot({ warm: 0.2 })])).toEqual([null]);
    expect(matchTones([null, shot()])).toEqual([null, null]);
    expect(toneOf([{ t: 0, b: 0.5 }, { t: 0.1, b: 0.5 }], 0, 1)).toBeNull();
    expect(toneOf([{ t: 0, b: 0.5, sat: 0.2, warm: 0, sd: 0.1 }, { t: 0.1, b: 0.3, sat: 0.4, warm: 0.1, sd: 0.3 }], 0, 1)).toEqual({ b: 0.4, sat: expect.closeTo(0.3, 5), warm: 0.05, sd: expect.closeTo(0.2, 5) });
  });
});

describe("colour match in the app's engine", () => {
  type Shot = { src: number; cs?: { bri?: number; con?: number; sat?: number; warm?: number }; cm?: boolean };
  async function reel(colour: boolean) {
    const w = world(8, 5);
    Object.entries(w.clips).forEach(([p, c], k) => c.samples.forEach((s) => { if (colour) Object.assign(s, { sat: 0.3, sd: 0.2, warm: p === "/c3.mp4" ? 0.14 : 0.01 }); void k; }));
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    return (w.e.host() as unknown as { ES: { edit: Shot[] } }).ES.edit;
  }
  it("cools the one warm clip's shots and leaves the others", async () => {
    const edit = await reel(true), warm = edit.filter((e) => e.src === 3), rest = edit.filter((e) => e.src !== 3);
    expect(warm.length).toBeGreaterThan(0);
    for (const e of warm) { expect(e.cm).toBe(true); expect(e.cs!.warm).toBeLessThan(0); }
    for (const e of rest) expect(e.cs?.warm ?? 0).toBe(0);
  });
  it("changes nothing when the clips were read without colour (an older scan)", async () => {
    const edit = await reel(false);
    expect(edit.some((e) => e.cm)).toBe(false);
  });
});
