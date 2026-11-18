import { describe, expect, it } from "vitest";
import { ADVICE, adviceLine, adviceWords, clipAdvice } from "@shubix/video-engine";

/** a plan of `n` shots of `len` s; `types` overrides some shots' kind */
const plan = (n: number, len = 1.5, types: Record<number, string> = {}) =>
  Array.from({ length: n }, (_, i) => ({ start: i * len, end: (i + 1) * len, type: types[i] ?? "cut" }));

describe("how many clips a song asks for", () => {
  it("about two shots a clip, 3 at least, 15 at most", () => {
    expect(clipAdvice(plan(20))).toEqual({ shots: 20, clips: 10, photos: 0 });
    expect(clipAdvice(plan(2))).toMatchObject({ clips: 3, photos: 0 });
    expect(clipAdvice(plan(60))!.clips + clipAdvice(plan(60))!.photos).toBe(ADVICE.most);
  });
  it("photos for the calm shots (breaks, long shots), never the opening, drops or hits", () => {
    const a = clipAdvice(plan(16, 2, { 0: "break", 3: "drop", 5: "hit" }))!;   // 13 calm shots of 2 s (not 0, 3, 5)
    expect(a.clips + a.photos).toBe(8);
    expect(a.photos).toBe(2);   // a quarter of 8
    expect(clipAdvice(plan(16, 1, { 4: "break", 9: "break" }))!.photos).toBe(1);   // short shots: only the 2 breaks
    expect(clipAdvice(plan(30, 2.5))!.photos).toBe(ADVICE.photoMost);
  });
  it("a fast song with short shots asks for clips only", () => {
    expect(clipAdvice(plan(24, 0.8, { 6: "drop", 12: "hit" }))).toEqual({ shots: 24, clips: 12, photos: 0 });
  });
  it("a Photo Reel asks for photos: one a shot, 8 to 30", () => {
    expect(clipAdvice(plan(12), true)).toEqual({ shots: 12, clips: 0, photos: 12 });
    expect(clipAdvice(plan(4), true)!.photos).toBe(8);
    expect(clipAdvice(plan(50), true)!.photos).toBe(30);
  });
  it("nothing without a plan", () => {
    expect(clipAdvice([])).toBeNull();
    expect(clipAdvice(null)).toBeNull();
  });
});

describe("what the clips step says", () => {
  const a = { shots: 20, clips: 8, photos: 2 };
  it("the advice, then how far the person is; more is optional", () => {
    expect(adviceWords(a)).toBe("8 clips + 2 photos");
    expect(adviceWords({ shots: 6, clips: 1, photos: 1 })).toBe("1 clip + 1 photo");
    expect(adviceWords({ shots: 12, clips: 0, photos: 12 })).toBe("12 photos");
    expect(adviceLine(a)).toBe("For this song: 8 clips + 2 photos");
    expect(adviceLine(a, 7)).toBe("7 of 10 added · 3 more make it better (optional)");
    expect(adviceLine(a, 9)).toBe("9 of 10 added · 1 more makes it better (optional)");
    expect(adviceLine(a, 12)).toBe("Enough for this song (8 clips + 2 photos)");
    expect(adviceLine(null, 3)).toBe("");
  });
});
