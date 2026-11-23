import { describe, expect, it } from "vitest";
import { bestMoment, bestMomentWords } from "@mobile/video-engine";

/** A clip's card says where its best moment is, read from the clip's own scan (no AI) */
const scan = (dur: number, f: (t: number) => { m: number; sh?: number; b?: number }) =>
  Array.from({ length: Math.round(dur * 4) }, (_, i) => ({ t: i / 4, ...f(i / 4) }));

describe("bestMoment", () => {
  it("finds the part that moves, sharp and not dark", () => {
    const at = bestMoment(scan(10, (t) => ({ m: t > 4 && t < 6 ? 0.3 : 0.02, sh: 1, b: 0.5 })), 10);
    expect(at).not.toBeNull(); expect(at!).toBeGreaterThanOrEqual(3.5); expect(at!).toBeLessThanOrEqual(5);
  });
  it("a dark part is not the best moment, however much it moves", () => {
    const at = bestMoment(scan(10, (t) => ({ m: t < 3 ? 0.4 : t > 6 && t < 8 ? 0.15 : 0.01, b: t < 3 ? 0.02 : 0.5 })), 10);
    expect(at!).toBeGreaterThan(4.5);
  });
  it("nothing to say: a still clip, a very short clip, no scan", () => {
    expect(bestMoment(scan(10, () => ({ m: 0 })), 10)).toBeNull();
    expect(bestMoment(scan(1.5, () => ({ m: 0.3 })), 1.5)).toBeNull();
    expect(bestMoment(null, 10)).toBeNull();
  });
  it("in words, as the clip's own clock", () => {
    expect(bestMomentWords(4.6)).toBe("Best moment 0:04");
    expect(bestMomentWords(72)).toBe("Best moment 1:12");
    expect(bestMomentWords(null)).toBe("");
  });
});
