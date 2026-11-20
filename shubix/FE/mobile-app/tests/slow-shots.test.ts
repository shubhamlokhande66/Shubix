import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

// A shot in slow motion plays a moment with smooth movement in it (a walk, an entrance), as an editor picks it: not a still
// picture (slowed, nothing changes; the old rule looked for motion 0.18) nor the most frantic one.
describe("slow motion", () => {
  it("plays a moment with movement in it, not a still one", async () => {
    const all: number[] = [];
    for (const seed of [3, 7, 11]) {
      const w = world(20, seed, { still: true });   // each clip: its first half still (a tripod shot, a pause), then movement
      await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); (w.e.host() as unknown as { ES: { seqOn: boolean } }).ES.seqOn = false;   // Mix all clips: the picker free to choose
      await w.e.call("ready");
      const ES = (w.e.host() as unknown as { ES: { edit: { start: number; end: number; mot?: number; sp: { pos: (l: number) => number } }[] } }).ES;
      for (const e of ES.edit) { const len = e.end - e.start; if (e.sp.pos(len) < 0.8 * len) all.push(e.mot ?? 0); }
    }
    expect(all.length).toBeGreaterThan(10);
    const med = [...all].sort((a, b) => a - b)[all.length >> 1];
    expect(med).toBeGreaterThan(0.3);
    expect(med).toBeLessThan(0.55);
    expect(all.every((m) => m >= 0.1)).toBe(true);
  }, 300000);
});
