import { describe, expect, it } from "vitest";
import { BOX_ASPECT, BOX_SLOTS, boxCrop, boxLayers, boxShots, boxSources, boxTimes, bumpAt } from "@shubix/video-engine";
import { parseDirectorVisualIntent } from "../components/studio/visualIntent";
import { CHAT_COMMANDS } from "@shubix/core/lib/chatCommands";

// Photo boxes (a creator's food Reel, 2026-11-26): five boxes with pictures from the other clips pop in on the beat over
// the long shots, one after another, and go together before the cut.
const shot = (start: number, end: number, src: number, beatsIn: number[] = []) => ({ start, end, src, beatsIn });
const reel = [shot(0, 0.8, 0), shot(0.8, 2.6, 1, [0.4, 0.8, 1.2]), shot(2.6, 3.2, 2), shot(3.2, 5, 3, [0.5, 1]), shot(5, 5.5, 4), shot(5.5, 7.4, 5), shot(7.4, 8, 6)];

describe("photo boxes", () => {
  it("go on the long shots, never the first nor two side by side", () => {
    const s = boxShots(reel, 0.4);
    expect(s).toEqual([1, 3, 5]);
    expect(boxShots([shot(0, 3, 0), shot(3, 3.5, 1)], 0.4)).toEqual([]);
  });
  it("pop in one after another inside the shot and go together before its cut", () => {
    const { t0s, t1 } = boxTimes(reel[1], 0.4);
    expect(t0s.length).toBe(5);
    expect(t0s[0]).toBeCloseTo(0.8 + 0.8, 5);                 // the beat a little before the middle
    for (let k = 1; k < 5; k++) expect(t0s[k]).toBeGreaterThan(t0s[k - 1]);
    expect(t1).toBeLessThanOrEqual(2.6);
    expect(t1 - t0s[4]).toBeGreaterThan(0.3);                   // seen a moment, all five
  });
  it("show other clips, not the shot itself", () => {
    const p = boxSources(reel, 3);
    expect(p.length).toBe(5);
    expect(p.every((q) => q.shot !== 3)).toBe(true);
    expect(new Set(p.map((q) => q.shot)).size).toBe(5);
  });
  it("crop a picture to the box's tall shape, the middle kept", () => {
    const c = boxCrop(1080, 1920);
    expect((1080 * (1 - c.l - c.r)) / 1920).toBeCloseTo(BOX_ASPECT, 3);
    const w = boxCrop(1920, 1080);
    expect(w.l).toBeCloseTo(w.r, 6);
  });
  it("five layers in the five places, framed, popping in", () => {
    const L = boxLayers(reel[1], 0.4);
    expect(L.map((x) => [x.x, x.y])).toEqual(BOX_SLOTS.map((p) => [p.x, p.y]));
    expect(L.every((x) => x.edge > 0 && x.bump > 0)).toBe(true);
    expect(bumpAt(L[0], L[0].t0).s).toBeCloseTo(0.55, 5);
    expect(bumpAt(L[0], L[0].t0 + 1).s).toBeCloseTo(1, 5);
    expect(Math.max(...[0.1, 0.12, 0.14, 0.16].map((d) => bumpAt(L[0], L[0].t0 + d).s))).toBeGreaterThan(1);   // the overshoot
  });
  it("are asked in words and by /effect, never mixed up with the box panels transition", () => {
    for (const say of ["Add photo boxes on the clips", "pizza var 5 box pop kar", "5 boxes on top of the pizza shot", CHAT_COMMANDS.find((c) => c.cmd === "/effect")!.choices[0].say])
      expect(parseDirectorVisualIntent(say).photoBoxes, say).toBe(true);
    expect(parseDirectorVisualIntent("all clips la 5 box transition lav").photoBoxes).toBeFalsy();
    expect(parseDirectorVisualIntent("Use the Box panels transition on every clip").photoBoxes).toBeFalsy();
  });
});
