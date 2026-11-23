import { describe, expect, it } from "vitest";
import { applyCompared, compareMoments, keepOneComparison, type CompareClip } from "@shubix/video-engine";

const clips = (n: number): CompareClip[] => Array.from({ length: n }, () => ({ ai: { frames: [{ t: 1, score: 0.2 }, { t: 2, score: 0.9 }] } }));
describe("the moments compared", () => {
  it("every clip's best first, then their second", () => expect(compareMoments(clips(2))).toEqual([[0, 1], [1, 1], [0, 0], [1, 0]]));
  it("one clip has nothing to be compared with; never over the most", () => { expect(compareMoments(clips(1))).toEqual([]); expect(compareMoments(clips(40))).toHaveLength(30); });
  it("the answer goes on its frames, a bad one is ignored", () => {
    const c = clips(2);
    expect(applyCompared(c, [{ id: "1_0", open: 2, pos: 0.4 }, { id: "9_9", open: 1, pos: 1 }])).toBe(1);
    expect(c[1].ai!.frames[0]).toMatchObject({ open: 1, pos: 0.4 });
  });
  it("comparisons of different Reels are never mixed; a part of one stays", () => {
    const a = clips(2), b = clips(2);
    applyCompared(a, [{ id: "0_1", open: 1, pos: 0 }]); applyCompared(b, [{ id: "0_1", open: 1, pos: 0 }]);
    keepOneComparison([a[0]]); expect(a[0].ai!.frames[1].open).toBe(1);
    const mixed = [a[0], b[0]]; keepOneComparison(mixed);
    for (const c of mixed) expect(c.ai!.frames[1].open).toBeUndefined();
  });
});
