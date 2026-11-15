import { describe, expect, it } from "vitest";
import { barsBand, bwShots, endCardTime, handleOf, tintAt, tintPulses, TINTS } from "@shubix/video-engine";
import { templateTexts } from "@shubix/core/lib/text-templates";

/** The finish creators give a Reel (Shared/video-engine/src/finish.ts): the @handle, the end card's time, cinematic bars,
 * the colour flash on the beat, black and white until the drop. Both engines use these. */
describe("the finish", () => {
  it("writes the @handle one way, from whatever was typed", () => {
    expect(handleOf("shubix.studio")).toBe("@shubix.studio");
    expect(handleOf(" @@my name ")).toBe("@myname");
    expect(handleOf("https://www.instagram.com/vp_cinematic_90/?hl=en")).toBe("@vp_cinematic_90");
    expect(handleOf("")).toBe("");
  });
  it("ends the Reel on 2.5 to 4.4 s, on a beat when one is near; none on a short Reel", () => {
    expect(endCardTime(30)).toEqual({ t0: 25.6, t1: 30 });
    expect(endCardTime(12)).toEqual({ t0: 9.5, t1: 12 });
    expect(endCardTime(30, [25.4, 26])).toEqual({ t0: 25.4, t1: 30 });
    expect(endCardTime(6)).toBeNull();
  });
  it("the end card's words", () => {
    expect(templateTexts("endcard", ["@me", "Follow for more"], 25, 4.4).map((p) => p.text)).toEqual(["@me", "Follow for more"]);
    expect(templateTexts("endtext", ["@me", ""], 25, 4.4).map((p) => p.text)).toEqual(["@me"]);
  });
  it("cinematic bars leave a 2.39:1 band in the middle", () => {
    const [y, h] = barsBand(1080, 1920);
    expect(h).toBeCloseTo(1080 / 2.39); expect(y + h / 2).toBeCloseTo(960);
    expect(barsBand(1920, 1080, 2.39)[0]).toBeCloseTo((1080 - 1920 / 2.39) / 2);
  });
  it("flashes blue then orange on the strong beats, fading", () => {
    const p = tintPulses([1, 1.2, 2, 3, 9], 0.3, 8);
    expect(p).toEqual([[1, TINTS[0]], [2, TINTS[1]], [3, TINTS[0]]]);
    expect(tintAt(p, 2)).toEqual({ a: 1, c: TINTS[1] });
    expect(tintAt(p, 2.3).a).toBeLessThan(0.3);
    expect(tintAt(p, 0.5).a).toBe(0);
  });
  it("black and white until the drop: the shots before it", () => {
    const shots = [{ start: 0 }, { start: 2 }, { start: 4 }, { start: 6 }];
    expect(bwShots(shots, 4)).toEqual([0, 1]);
    expect(bwShots(shots, null)).toEqual([]);
    expect(bwShots(shots, 1)).toEqual([]);
  });
});
