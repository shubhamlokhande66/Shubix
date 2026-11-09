import { describe, expect, it } from "vitest";
import { songAnalysis } from "@shubix/core/engine/studio/song";

/** The music engine finds each bar's "1" (so cuts every 2, 4 or 8 beats follow the song), and cuts a song with little beat less. */
const SR = 22050, B = 0.5;   // 120 BPM
function make(sec: number, hit: (k: number) => number) {
  const out = new Float32Array(sec * SR);
  for (let k = 0; k * B < sec - 0.2; k++) {
    const a = hit(k), at = Math.round(k * B * SR);
    for (let i = 0; i < 0.15 * SR && at + i < out.length; i++) { const d = i / SR; out[at + i] += a * (Math.sin(2 * Math.PI * 60 * d) * Math.exp(-d / 0.05) + 0.3 * Math.sin(2 * Math.PI * 2200 * d) * Math.exp(-d / 0.01)); }
  }
  return out;
}
const near = (xs: number[], t: number) => xs.some((x) => Math.abs(x - t) < 0.08);

describe("bars", () => {
  it("puts the bar's first beat where the kick hits hardest", () => {
    const r = songAnalysis(make(24, (k) => (k % 4 === 1 ? 1 : 0.35)), SR, {});
    const ones = Array.from({ length: 10 }, (_, j) => (1 + 4 * j) * B).filter((t) => t > 1 && t < 22);
    expect(r.downbeats.length).toBeGreaterThan(5);
    expect(ones.filter((t) => near(r.downbeats, t)).length / ones.length).toBeGreaterThan(0.8);
  });
  it("takes the bars the neural tracker heard", () => {
    const m = make(24, () => 0.8), beats = Array.from({ length: 47 }, (_, k) => k * B), downs = beats.filter((_, k) => k % 4 === 2);
    const r = songAnalysis(m, SR, { beats, downbeats: downs });
    expect(r.barLen).toBe(4);
    expect(downs.filter((t) => t > 1 && t < 22).every((t) => near(r.downbeats, t))).toBe(true);
  });
  it("cuts a song with no drums at most every 2 beats", () => {
    const out = new Float32Array(24 * SR);
    for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * t / 8)); }
    const r = songAnalysis(out, SR, {});
    const gaps = r.cuts.slice(1).map((c: number, k: number) => c - r.cuts[k]);
    expect(gaps.every((g: number) => g > 0.75)).toBe(true);
  });
});
