import { describe, expect, it } from "vitest";
import { absorbRepeats, clipUse, wasteShare } from "@shubix/video-engine";

const clip = (dur: number, m: (t: number) => number, sh: (t: number) => number = () => 100) =>
  ({ dur, samples: Array.from({ length: dur * 10 }, (_, i) => ({ t: i / 10, m: m(i / 10) * (1 + 0.3 * Math.sin(i * 1.7)), sh: sh(i / 10) })) });

describe("which part of a clip is footage", () => {
  it("leaves out the laughing after a dance, and keeps the pose", () => {
    const c = clip(20, (t) => (t < 16 ? 0.06 : 0.025));
    expect(clipUse(c).to).toBe(20);
    const u = clipUse({ ...c, reacts: [{ t0: 16.4, t1: 19 }] });
    expect(u.to).toBeGreaterThan(15.5); expect(u.to).toBeLessThan(16.8);
  });
  it("keeps a laugh or a cheer while the action goes on", () => {
    expect(clipUse({ ...clip(20, () => 0.06), reacts: [{ t0: 17, t1: 19 }] })).toEqual({ from: 0, to: 20, why: [] });
  });
  it("leaves out standing about after the action and before it", () => {
    const u = clipUse(clip(20, (t) => (t < 3 || t > 16 ? 0.004 : 0.06)));
    expect(u.from).toBeGreaterThan(1.8); expect(u.from).toBeLessThan(3.2); expect(u.to).toBeGreaterThan(16); expect(u.to).toBeLessThan(17.2);
  });
  it("leaves out reaching to stop the camera", () => {
    const u = clipUse(clip(12, (t) => (t > 11 ? 0.15 : 0.03), (t) => (t > 11 ? 40 : 100)));
    expect(u.to).toBeGreaterThan(10.4); expect(u.to).toBeLessThan(11.3);
  });
  it("goes by Shubix AI's looks", () => {
    const ai = { frames: [1, 5, 9, 13, 18].map((t, i) => ({ t, score: i === 4 ? 0.15 : 0.7 })) };
    expect(clipUse({ ...clip(20, () => 0.04), ai }).to).toBeCloseTo(15.5);
  });
  it("leaves a calm clip, a short clip and a steady clip whole", () => {
    expect(clipUse(clip(10, (t) => (t < 6 ? 0.006 : 0.001))).to).toBe(10);
    expect(clipUse(clip(4, (t) => (t < 2 ? 0.06 : 0.001))).to).toBe(4);
    expect(clipUse(clip(15, () => 0.05))).toEqual({ from: 0, to: 15, why: [] });
  });
  it("says how much of a moment is not footage", () => {
    expect(wasteShare({ from: 2, to: 10, why: [] }, 9, 11)).toBeCloseTo(0.5);
    expect(wasteShare({ from: 2, to: 10, why: [] }, 3, 5)).toBe(0);
  });
});

describe("no moment twice", () => {
  const n = { pos: (l: number) => l }, o = { end: () => 8, from: () => 0, crosses: () => false };
  it("the shot before runs on over a repeated one", () => {
    const plan = [0, 2, 4].map((s) => ({ start: s, end: s + 2, sp: n })), res = [{ src: 0, in: 0, scaleR: 1 }, { src: 1, in: 0, scaleR: 1 }, { src: 0, in: 0.5, scaleR: 1, ov: 1.5 }];
    expect(absorbRepeats(plan, res, n, o)).toBe(1);
    expect(plan.map((p) => [p.start, p.end])).toEqual([[0, 2], [2, 6]]); expect(res.length).toBe(2);
  });
  it("leaves a Reel without repeats as it is", () => {
    const plan = [0, 2].map((s) => ({ start: s, end: s + 2, sp: n })), res = [{ src: 0, in: 0, scaleR: 1 }, { src: 0, in: 3, scaleR: 1 }];
    expect(absorbRepeats(plan, res, n, o)).toBe(0); expect(plan.length).toBe(2);
  });
});
