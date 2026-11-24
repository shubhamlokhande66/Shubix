// @ts-nocheck: plain .mjs scripts run by hand on a computer, without types
import { describe, expect, it } from "vitest";
import { chance, plan, verdict } from "../scripts/studio-ab/ab.mjs";
import { creatorOf, halves, onBeat, range, shotsOf } from "../scripts/studio-references/study.mjs";

const files = (n) => Array.from({ length: n }, (_, i) => [{ name: `p${i}.old.mp4`, size: i + 1 }, { name: `p${i}.new.mp4`, size: i + 100 }]).flat();
const votes = (w, l, t = 0) => [...Array(w).fill({ won: "new" }), ...Array(l).fill({ won: "old" }), ...Array(t).fill({ won: "tie" })];

describe("the blind A/B", () => {
  it("passes at 20 of 30, not at 19, and never on a few pairs", () => {
    expect(chance(20, 30)).toBeCloseTo(0.0494, 3);
    expect(chance(0, 30)).toBeCloseTo(1, 9);
    expect(verdict(votes(20, 10)).pass).toBe(true);
    expect(verdict(votes(19, 11)).pass).toBe(false);
    expect(verdict(votes(19, 0, 11)).pass).toBe(false);
    expect(verdict(votes(10, 0)).pass).toBe(false);
  });
  it("puts the new one on each side equally, and the same again for the same person", () => {
    const key = (who, f) => plan(f, who).pairs.map((p) => p.id + p.aIs), pairs = plan(files(30), "Asha").pairs;
    expect(pairs.filter((p) => p.aIs === "new")).toHaveLength(15);
    expect(key("asha", files(30).reverse())).toEqual(key("Asha", files(30)));
    expect(key("Ravi", files(30))).not.toEqual(key("Asha", files(30)));
    for (const p of pairs) expect(p.a.name).toContain(`.${p.aIs}.`);
  });
  it("leaves out a Reel without its partner", () => {
    const r = plan([...files(2), { name: "x.new.mp4", size: 1 }], "a");
    expect(r.pairs).toHaveLength(2); expect(r.single).toEqual(["x"]);
  });
});

describe("the Reel study", () => {
  it("finds where in a shot the action is, and leaves out photos and the black end card", () => {
    const m = new Float64Array(180).fill(1), light = new Float64Array(180).fill(100);
    m[45] = 20; m.fill(0, 60, 120); light.fill(5, 120);   // an action at 1.5 s, then a photo, then black
    const s = shotsOf(m, light, [2, 4], 6);
    expect(s).toHaveLength(1);
    expect(Math.abs(s[0].peak - 1.5)).toBeLessThan(0.05);
    expect(s[0].fifths[4] + s[0].fifths[3]).toBeGreaterThan(s[0].fifths[0]);
  });
  it("tells peaks on the beat from peaks anywhere", () => {
    const beats = Array.from({ length: 60 }, (_, i) => i * 0.5), at = (f) => Array.from({ length: 40 }, (_, i) => ({ peak: f(i), strength: 2 }));
    const on = onBeat(at((i) => 2 + i * 0.5), beats, 0.5), any = onBeat(at((i) => 2 + i * 0.6180339), beats, 0.5);
    expect(on.real - on.chance).toBeGreaterThan(0.6);
    expect(Math.abs(any.real - any.chance)).toBeLessThan(0.12);
  });
  it("keeps a creator in one half and counts them once", () => {
    const h = halves(["a", "b", "c", "d", "a"]);
    expect([...h.values()].filter((x) => x === "learn")).toHaveLength(2);
    expect(creatorOf("x/Priya__trip.mp4")).toBe("priya");
    expect(range([["a", 1], ["a", 1], ["a", 1], ["b", 3]]).mean).toBe(2);
    expect(range([["a", 1], ["b", 3]]).low).toBeNull();
  });
});
