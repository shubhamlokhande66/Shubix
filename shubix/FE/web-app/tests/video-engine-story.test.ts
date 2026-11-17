import { describe, expect, it } from "vitest";
import { STORY, storyBonus, storyRoles, teaserCut, teaserFree, teaserWorth } from "@shubix/video-engine";

// The Reel as a story (Shared/video-engine story.ts): hook, setup, build, peak, close.
const slots = (kinds: string[], len = 1) => kinds.map((kind, i) => ({ kind, start: i * len, end: (i + 1) * len }));

describe("each shot's part in the story", () => {
  it("opens on the hook, sets the scene, peaks on the drops and closes", () => {
    const r = storyRoles(slots(["cut", "cut", "cut", "cut", "drop", "cut", "hit", "cut", "hit", "cut"]));
    expect(r[0]).toBe("hook");
    expect(r[1]).toBe("setup");          // early, before the first drop
    expect(r[4]).toBe("peak");           // the drop
    expect(r[6]).toBe("peak");           // a hit late in the Reel (at 60%)
    expect(r[5]).toBe("build");
    expect(r[9]).toBe("close");
  });
  it("a short Reel has no setup and no separate close", () => {
    expect(storyRoles(slots(["cut", "cut", "cut"]))).toEqual(["hook", "build", "build"]);
    expect(storyRoles([])).toEqual([]);
  });
  it("no setup after the first drop", () => {
    const r = storyRoles(slots(["cut", "cut", "drop", ...Array(17).fill("cut")]));   // 20 shots: the first 4 are the opening fifth
    expect(r.slice(0, 5)).toEqual(["hook", "setup", "peak", "build", "build"]);
  });
});

describe("what suits each part", () => {
  const wide = { motion: 0.3, face: 0, faceSize: 0 }, closeUp = { motion: 0.3, face: 1, faceSize: 0.3 };
  it("the setup prefers a wide, steady shot to a close-up", () => {
    expect(storyBonus("setup", wide)).toBeGreaterThan(storyBonus("setup", closeUp));
    expect(storyBonus("setup", { ...wide, motion: 1 })).toBeLessThan(storyBonus("setup", wide));
  });
  it("the peak prefers people close up", () => {
    expect(storyBonus("peak", closeUp)).toBeGreaterThan(storyBonus("peak", wide));
    expect(storyBonus("peak", { ...closeUp, face: 0.2 })).toBe(0);   // a face in a frame or two is not a close-up
  });
  it("the last shot is calm when the song settles, strong when it ends on a hit", () => {
    const calm = { motion: 0.1, face: 0, faceSize: 0 }, busy = { motion: 0.9, face: 0, faceSize: 0 };
    expect(storyBonus("close", { ...calm, kind: "cut" })).toBeGreaterThan(storyBonus("close", { ...busy, kind: "cut" }));
    expect(storyBonus("close", { ...busy, kind: "hit" })).toBeGreaterThan(storyBonus("close", { ...calm, kind: "hit" }));
  });
  it("never more than a nudge, and nothing for the hook or the build", () => {
    for (const role of ["setup", "peak", "close"] as const) for (const m of [wide, closeUp, { motion: 9, face: 9, faceSize: 9 }, { motion: NaN, face: -1, faceSize: NaN }])
      expect(Math.abs(storyBonus(role, m))).toBeLessThanOrEqual(STORY.most);
    expect(storyBonus("hook", closeUp)).toBe(0);
    expect(storyBonus("build", closeUp)).toBe(0);
    expect(storyBonus(undefined, closeUp)).toBe(0);
  });
});

describe("the teaser", () => {
  it("is cut on a beat about a second in, one frame before it", () => {
    expect(teaserCut(0, 4, [0.5, 1, 1.5, 2, 2.5])).toBeCloseTo(1.5 - 1 / 30);
    expect(teaserCut(10, 14, [10.6, 11.2, 11.8])).toBeCloseTo(11.2 - 1 / 30);
  });
  it("needs a long enough opening shot with a beat in the right place", () => {
    expect(teaserCut(0, 2, [1, 1.5])).toBeNull();          // too short to split
    expect(teaserCut(0, 4, [0.3, 2.5, 3.5])).toBeNull();   // no beat 0.9-1.9 s in
    expect(teaserCut(0, 3, [1.8])).toBeNull();             // too little of the opening left after it
  });
  it("only when clearly stronger than the opening", () => {
    expect(teaserWorth(1, 1.2)).toBe(false);
    expect(teaserWorth(1, 1 + STORY.teaserBetter)).toBe(true);
    expect(teaserWorth(1, NaN)).toBe(false);
  });
  it("never shows a moment the Reel shows elsewhere", () => {
    expect(teaserFree(5, 6, [[0, 4], [8, 9]])).toBe(true);
    expect(teaserFree(5, 6, [[6.1, 7]])).toBe(false);      // too close: it would look like the same moment twice
    expect(teaserFree(5, 6, [[4, 5.5]])).toBe(false);
  });
});
