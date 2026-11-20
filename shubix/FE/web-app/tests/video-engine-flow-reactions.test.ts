import { describe, expect, it } from "vitest";
import { FLOW, REACT, flowBonus, flowGap, reactionBonus, reactionsOf } from "@shubix/video-engine";

describe("shot flow: a shot drawn to the look of its neighbours", () => {
  const calmWarm = { m: 0.2, b: 0.5, warm: 0.1 }, calmWarm2 = { m: 0.25, b: 0.52, warm: 0.09 }, busyCool = { m: 0.9, b: 0.2, warm: -0.1 };
  it("alike shots are close, a cut to another world is far", () => {
    expect(flowGap(calmWarm, calmWarm2)).toBeLessThan(0.2);
    expect(flowGap(calmWarm, busyCool)).toBeGreaterThan(1.5);
    expect(flowGap({ m: 0.3, b: 0.4 }, { m: 0.3, b: 0.4, warm: 0.5 })).toBe(0);   // no colour read: warmth not compared
  });
  it("the bonus prefers the moment that flows on, and is 0 with no neighbour placed", () => {
    expect(flowBonus(calmWarm2, [calmWarm])).toBeGreaterThan(flowBonus(busyCool, [calmWarm]));
    expect(flowBonus(busyCool, [])).toBe(0);
    expect(flowBonus(busyCool, [null, undefined])).toBe(0);
    expect(flowBonus(calmWarm, [calmWarm])).toBeCloseTo(0);
    expect(flowBonus(busyCool, [calmWarm])).toBeCloseTo(-FLOW.weight * flowGap(busyCool, calmWarm));
  });
});

/** a clip's sound: a steady murmur, louder parts where asked (seconds, gain) */
const sound = (secs: number, loud: [number, number, number][] = [], sr = 8000, base = 0.02) => {
  const x = new Float32Array(Math.round(secs * sr));
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, g = loud.find(([a, b]) => t >= a && t < b)?.[2] ?? 1;
    x[i] = base * g * Math.sin(i * 0.37) * (0.8 + 0.4 * Math.sin(i * 0.011));
  }
  return x;
};

describe("reactions in a clip's own sound", () => {
  it("a cheer that rises out of a quieter part is found, where it is", () => {
    const R = reactionsOf(sound(10, [[4, 5.5, 6]]), 8000);
    expect(R).toHaveLength(1);
    expect(R[0].t0).toBeCloseTo(4, 0);
    expect(R[0].t1).toBeCloseTo(5.5, 0);
    expect(R[0].s).toBeGreaterThan(0.5);
  });
  it("nothing in a steady clip, a silent one, or one loud all through", () => {
    expect(reactionsOf(sound(10), 8000)).toEqual([]);
    expect(reactionsOf(new Float32Array(80000), 8000)).toEqual([]);
    expect(reactionsOf(sound(10, [[0, 6, 6]]), 8000)).toEqual([]);   // loud for 60% of the clip: music playing
    expect(reactionsOf(sound(10, [[4, 4.1, 6]]), 8000)).toEqual([]);   // a click, not a reaction
  });
  it("a moment showing the reaction, or what led to it, gets the bonus; one far from it does not", () => {
    const R = [{ t0: 4, t1: 5.5, s: 1 }];
    expect(reactionBonus(R, 4, 6)).toBeCloseTo(REACT.weight);
    expect(reactionBonus(R, 3.4, 4.4)).toBeGreaterThan(0);   // just before: what people reacted to
    expect(reactionBonus(R, 0, 2)).toBe(0);
    expect(reactionBonus(undefined, 0, 2)).toBe(0);
  });
});
