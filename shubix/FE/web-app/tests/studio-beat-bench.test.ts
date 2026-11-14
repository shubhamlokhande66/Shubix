import { describe, expect, it } from "vitest";
// (bench.mjs is a plain script: scripts/studio-beats)
import { matchBeats } from "../scripts/studio-beats/bench.mjs";

// the benchmark's own arithmetic: a wrong score here would call a worse tracker better
describe("the beat benchmark's scoring", () => {
  const truth = [1, 2, 3, 4];
  it("gives a full score to the true beats, and counts how far each found beat is", () => {
    const r = matchBeats([1.01, 2, 2.99, 4.03], truth, 0.07);
    expect(r.f).toBe(1);
    expect(r.offs.map((o: number) => Math.round(o * 1000))).toEqual([10, 0, 10, 30]);
  });
  it("does not count a beat outside the tolerance", () => {
    expect(matchBeats([1.05, 2, 3, 4], truth, 0.04).f).toBeCloseTo(0.75);
    expect(matchBeats([1.05, 2, 3, 4], truth, 0.07).f).toBe(1);
  });
  it("uses a found beat for one true beat only", () => {
    const r = matchBeats([1.5], [1.45, 1.55], 0.07);
    expect(r.recall).toBe(0.5);
    expect(r.precision).toBe(1);
  });
  it("marks a tracker at twice the tempo down by its extra beats, and one at half by the beats it misses", () => {
    const double = matchBeats([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5], truth, 0.07);
    expect(double.recall).toBe(1);
    expect(double.precision).toBe(0.5);
    expect(double.f).toBeCloseTo(2 / 3);
    const half = matchBeats([1, 3], truth, 0.07);
    expect(half.precision).toBe(1);
    expect(half.f).toBeCloseTo(2 / 3);
  });
  it("scores nothing found, or nothing to find, as zero and not as an error", () => {
    expect(matchBeats([], truth, 0.07).f).toBe(0);
    expect(matchBeats([1, 2], [], 0.07).f).toBe(0);
  });
});
