import { describe, expect, it } from "vitest";
import { budgetEffects, budgetLiftFrom, FLASHY_TRANSITIONS, STRONG_EFFECTS, STRONG_KEYS, type BudgetShot } from "@mobile/video-engine";

// The effect budget agreed with ChatGPT (2026-11-20), on the plan Shubix AI really gave a 22 s phone Reel: a flash, a
// shake or an RGB split on 5 shots of 6, for a Reel it called "devotional". Shared/video-engine budget.ts.
const real: BudgetShot[] = [
  { start: 0, end: 2.3, type: "cut", tr: "hard", fx: "hook", keys: [{ at: 0.5, do: "punch" }], move: false, loud: 0.6 },
  { start: 2.3, end: 7.1, type: "hit", tr: "flash", fx: "zoomburst", keys: [{ at: 0.4, do: "flash" }, { at: 1.6, do: "punch" }], move: true, loud: 0.7 },
  { start: 7.1, end: 9.2, type: "drop", tr: "whip", fx: "shake", keys: [{ at: 0.3, do: "shake" }, { at: 1.1, do: "flash" }], move: false, loud: 0.95 },
  { start: 9.2, end: 12.4, type: "hit", tr: "hard", fx: "rgbpulse", keys: [{ at: 0.2, do: "punch" }, { at: 1.4, do: "shake" }], move: false, loud: 0.85 },
  { start: 12.4, end: 15.9, type: "cut", tr: "zoom", fx: "bounce", keys: [{ at: 0.6, do: "pulse" }, { at: 2, do: "punch" }], move: false, loud: 0.8 },
  { start: 15.9, end: 22, type: "cut", tr: "dip", fx: "pan", keys: [{ at: 1, do: "pulse" }, { at: 3, do: "flash" }], move: true, loud: 0.5 },
];
const units = (s: BudgetShot) => (s.tr && !["hard", "fadein"].includes(s.tr) ? 1 : 0) + (s.fx && s.fx !== "none" ? 1 : 0) + (s.keys?.length ? 1 : 0) + (s.move ? 1 : 0);
const loudAt = (shots: BudgetShot[]) => shots.flatMap((s) => [
  ...(s.tr && FLASHY_TRANSITIONS.has(s.tr) ? [s.start] : []), ...(s.fx && STRONG_EFFECTS.has(s.fx) ? [s.start] : []),
  ...(s.keys || []).filter((k) => STRONG_KEYS.has(k.do)).map((k) => s.start + k.at)]).sort((a, b) => a - b);
const most = (times: number[], win = 10) => Math.max(0, ...times.map((t) => times.filter((u) => u >= t && u < t + win).length));

describe("the effect budget", () => {
  it("keeps the real AI plan within a pro editor's limits", () => {
    const r = budgetEffects(real, { mood: "A high-energy devotional celebration with powerful car reveals" });
    expect(r.heroes).toEqual([2]);                                   // the first drop
    expect(r.shots[0].tr).toBe("hard");
    expect(units(r.shots[0])).toBeLessThanOrEqual(1);                // the hook: one thing inside it
    r.shots.forEach((s, i) => expect(units(s)).toBeLessThanOrEqual(i === 2 ? 3 : 1));
    expect(r.shots.filter((s) => units(s) === 0).length).toBeGreaterThanOrEqual(Math.ceil(0.3 * real.length));
    expect(most(loudAt(r.shots))).toBeLessThanOrEqual(3);
    expect(r.changes.length).toBeGreaterThan(0);
    r.changes.forEach((c) => expect(c.why).toBeTruthy());
  });

  it("leaves a Reel already within it as it is", () => {
    const clean: BudgetShot[] = [
      { start: 0, end: 2, type: "cut", tr: "hard", fx: "none", keys: [], move: true },
      { start: 2, end: 4, type: "cut", tr: "hard", fx: "none", keys: [] },
      { start: 4, end: 6, type: "drop", tr: "flash", fx: "punch", keys: [{ at: 0.2, do: "shake" }] },
      { start: 6, end: 8, type: "cut", tr: "hard", fx: "none", keys: [] },
      { start: 8, end: 10, type: "hit", tr: "hard", fx: "punch", keys: [] },
    ];
    const r = budgetEffects(clean);
    expect(r.changes).toEqual([]);
    expect(r.shots).toEqual(clean);
  });

  it("a calm Reel has no loud tools where its song is quiet, and keeps them where it is loud", () => {
    const calm: BudgetShot[] = [
      { start: 0, end: 3, type: "cut", tr: "hard", fx: "none", keys: [], loud: 0.2 },
      { start: 3, end: 6, type: "cut", tr: "flash", fx: "none", keys: [], loud: 0.3 },
      { start: 6, end: 9, type: "cut", tr: "hard", fx: "none", keys: [{ at: 1, do: "shake" }], loud: 0.3 },
      { start: 9, end: 12, type: "drop", tr: "flash", fx: "none", keys: [], loud: 0.9 },
    ];
    const r = budgetEffects(calm, { mood: "a sad, emotional Reel" });
    expect(r.shots[1].tr).toBe("dissolve");
    expect(r.shots[2].keys).toEqual([]);
    expect(r.shots[3].tr).toBe("flash");
    expect(r.changes.filter((c) => c.rule === "mood").length).toBe(2);
  });

  it("never takes away what the creator asked for in their own words", () => {
    const lift = budgetLiftFrom("more transitions please, and shake on the bass");
    expect(lift.transitions).toBe(true);
    const many: BudgetShot[] = Array.from({ length: 8 }, (_, i) => ({ start: i * 1.5, end: i * 1.5 + 1.5, type: "cut", tr: i ? "whip" : "hard", fx: "shake", keys: [] }));
    const r = budgetEffects(many, { lift });
    expect(r.shots.slice(1).every((s) => s.tr === "whip")).toBe(true);
    expect(r.shots.every((s) => s.fx === "shake")).toBe(true);
    expect(budgetLiftFrom("मुझे ज़्यादा ट्रांज़िशन चाहिए").transitions).toBe(true);
    expect(budgetLiftFrom("flash on every clip").flash).toBe(true);
  });
});
