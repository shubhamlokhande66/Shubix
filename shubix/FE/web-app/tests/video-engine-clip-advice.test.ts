import { describe, expect, it } from "vitest";
import { ADVICE, adviceBoxes, adviceLine, adviceWords, boxFit, boxWords, clipAdvice, mediaKindOf, mediaPick, pickTakes } from "@shubix/video-engine";

/** a plan of `n` shots of `len` s; `types` overrides some shots' kind */
const plan = (n: number, len = 1.5, types: Record<number, string> = {}) =>
  Array.from({ length: n }, (_, i) => ({ start: i * len, end: (i + 1) * len, type: types[i] ?? "cut" }));

describe("how many clips a song asks for", () => {
  it("about two shots a clip, 3 at least, 15 at most", () => {
    expect(clipAdvice(plan(20))).toMatchObject({ shots: 20, clips: 10, photos: 0 });
    expect(clipAdvice(plan(2))).toMatchObject({ clips: 3, photos: 0 });
    expect(clipAdvice(plan(60))!.clips + clipAdvice(plan(60))!.photos).toBe(ADVICE.most);
  });
  it("a Beat Reel asks for clips only, also with calm parts (a clip takes them as well)", () => {
    expect(clipAdvice(plan(16, 2, { 2: "break", 3: "drop", 5: "hit" }))).toMatchObject({ shots: 16, clips: 8, photos: 0 });
    expect(clipAdvice(plan(30, 2.5))).toMatchObject({ shots: 30, clips: ADVICE.most, photos: 0 });
    expect(clipAdvice(plan(24, 0.8, { 6: "drop", 12: "hit" }))).toMatchObject({ shots: 24, clips: 12, photos: 0 });
  });
  it("a Photo Reel asks for photos: one a shot, 8 to 30", () => {
    expect(clipAdvice(plan(12), true)).toMatchObject({ shots: 12, clips: 0, photos: 12 });
    expect(clipAdvice(plan(4), true)!.photos).toBe(8);
    expect(clipAdvice(plan(50), true)!.photos).toBe(30);
  });
  it("Mix asks for as many, videos or photos in any share", () => {
    expect(clipAdvice(plan(20), "mix")).toMatchObject({ shots: 20, clips: 0, photos: 0, either: 10 });
    expect(adviceLine(clipAdvice(plan(20), "mix"))).toBe("For this song: 10 clips or photos");
    expect(adviceLine(clipAdvice(plan(20), "mix"), 4)).toBe("4 of 10 added · 6 more make it better (optional)");
    expect(clipAdvice(plan(20), "videos")).toEqual(clipAdvice(plan(20)));
    expect(clipAdvice(plan(12), "photos")).toEqual(clipAdvice(plan(12), true));
    expect(mediaPick(undefined)).toBe("videos");
  });
  it("nothing without a plan", () => {
    expect(clipAdvice([])).toBeNull();
    expect(clipAdvice(null)).toBeNull();
  });
});

describe("what the clips step says", () => {
  const a = { shots: 20, clips: 8, photos: 2 };
  it("the advice, then how far the person is; more is optional", () => {
    expect(adviceWords({ shots: 20, clips: 10, photos: 0 })).toBe("10 clips");
    expect(adviceLine({ shots: 20, clips: 10, photos: 0 })).toBe("For this song: 10 clips");
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

describe("each choice takes only what it says", () => {
  it("knows a video from a photo by its type or name", () => {
    expect(mediaKindOf({ type: "video/mp4", name: "a.mp4" })).toBe("video");
    expect(mediaKindOf({ type: "", name: "IMG_1.MOV" })).toBe("video");
    expect(mediaKindOf({ type: "image/jpeg", name: "a.jpg" })).toBe("photo");
    expect(mediaKindOf({ type: "", name: "b.HEIC" })).toBe("photo");
    expect(mediaKindOf({ type: "image", uri: "file:///x" })).toBe("photo");   // the phone's picker: type "image" / "video"
    expect(mediaKindOf({ type: "video", uri: "file:///y" })).toBe("video");
    expect(mediaKindOf({ type: "audio/mpeg", name: "s.mp3" })).toBeNull();
  });
  it("Videos takes videos, Photos photos, Mix both", () => {
    expect([pickTakes("videos", "video"), pickTakes("videos", "photo")]).toEqual([true, false]);
    expect([pickTakes("photos", "video"), pickTakes("photos", "photo")]).toEqual([false, true]);
    expect([pickTakes("mix", "video"), pickTakes("mix", "photo"), pickTakes("mix", null)]).toEqual([true, true, false]);
  });
});

describe("one box a clip, with the seconds it should have", () => {
  it("the shots in order, shared out, rounded up to half a second", () => {
    expect(adviceBoxes(plan(6, 1.5), 3)).toEqual([3, 3, 3]);
    expect(adviceBoxes([{ start: 0, end: 1.2 }, { start: 1.2, end: 2 }, { start: 2, end: 5 }], 2)).toEqual([2, 3]);   // whole shots: 1.2+0.8 | 3
    expect(adviceBoxes(plan(2, 1), 3)).toEqual([1, 1, 1]);   // more clips than shots: the 2 s shared out
    expect(clipAdvice(plan(20, 1.5))!.boxes).toHaveLength(10);
    expect(clipAdvice(plan(20, 1.5), "mix")!.boxes).toHaveLength(10);
    expect(clipAdvice(plan(12, 1.5), "photos")!.boxes).toHaveLength(12);
  });
  it("a longer clip fits (its best part is kept), a shorter one is said", () => {
    expect(boxFit(2, 4)).toBe("ok");
    expect(boxFit(2, 2)).toBe("ok");
    expect(boxFit(3, 1.2)).toBe("short");
    expect(boxFit(3, null)).toBe("empty");
    expect(boxWords(3)).toBe("3 s");
    expect(boxWords(2, 4)).toBe("✓ 2 s");
    expect(boxWords(3, 1.23)).toBe("1.2 of 3 s");
  });
});
