import { describe, expect, it } from "vitest";
import { shortReelFor, SHORT_REEL } from "@shubix/video-engine";

// A Reel from very little video (one 4 s clip): the song decides, nobody is sent back for more clips.
const period = (bpm: number) => 60 / bpm;
describe("the Reel of very little video", () => {
  it("under a slow song: slow motion, half speed, twice as long", () => {
    expect(shortReelFor(3.85, period(80))).toEqual({ len: 7.7, speed: 0.5 });
    expect(shortReelFor(4.5, period(95))).toEqual({ len: 9, speed: 0.5 });
  });
  it("under a fast song: as filmed, as long as the video", () => {
    expect(shortReelFor(3.85, period(140))).toEqual({ len: 3.9, speed: 0.99 });
    expect(shortReelFor(4.2, period(130))!.speed).toBe(1);
  });
  it("in between: in between, and slower as the song slows", () => {
    const speeds = [128, 120, 112, 104, 96].map((b) => shortReelFor(4, period(b))!.speed);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    expect(speeds[0]).toBeLessThan(1); expect(speeds[4]).toBeGreaterThan(0.5);
  });
  it("is never slower than half speed and never shorter than 3 s", () => {
    for (let have = SHORT_REEL.least; have < SHORT_REEL.enough; have += 0.1) for (const bpm of [0, 60, 90, 100, 115, 128, 150, 180]) {
      const r = shortReelFor(have, bpm ? period(bpm) : 0)!;
      expect(r.speed).toBeGreaterThanOrEqual(0.49); expect(r.speed).toBeLessThanOrEqual(1);
      expect(r.len).toBeGreaterThanOrEqual(SHORT_REEL.shortest); expect(r.len).toBeLessThanOrEqual(10);
    }
  });
  it("a song with no steady beat is taken as slow", () => expect(shortReelFor(4, 0)).toEqual({ len: 8, speed: 0.5 }));
  it("is never longer than the song", () => expect(shortReelFor(4, period(80), 6)!.len).toBe(6));
  it("under 2 s of good video there is no Reel: more clips", () => { expect(shortReelFor(1.9, period(80))).toBeNull(); expect(shortReelFor(NaN, 0.5)).toBeNull(); });
  it("5 s and more is not its business: as long as the video, as filmed", () => expect(shortReelFor(12.34, period(80))).toEqual({ len: 12.3, speed: 1 }));
});
