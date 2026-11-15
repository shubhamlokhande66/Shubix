import { describe, expect, it } from "vitest";
import { POP_SIDE, popAlpha, popAt, popInput, popLayer, popMaskBytes, popScore, popShots, popSteady, popWindow } from "@shubix/video-engine";

/** The subject pop (Shared/video-engine/src/pop.ts): which frame gives a cut-out, the cut-out's alpha, where the pop goes
 * and how it grows. Both engines make the pop with these. */
const S = POP_SIDE;
const maskOf = (inside: (x: number, y: number) => boolean) => { const m = new Uint8Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) m[y * S + x] = inside(x, y) ? 250 : 5; return m; };
const grey = (v: number) => { const p = new Uint8Array(S * S * 4); p.fill(v); return p; };
const car = (x: number, y: number) => x > 60 && x < 260 && y > 150 && y < 250;

describe("subject pop: which frame gives a cut-out", () => {
  it("one whole subject in the middle scores high", () => {
    const f = popScore(maskOf(car), grey(120));
    expect(f.score).toBeGreaterThan(0.8);
    expect(f.box[0]).toBeCloseTo(61 / S, 2); expect(f.box[3]).toBeCloseTo(250 / S, 2);
  });
  it("a subject cut by the frame's sides, one too small, one too big, a dark card: none", () => {
    expect(popScore(maskOf((x, y) => y > 100 && y < 260), grey(120)).score).toBeLessThan(0.2);
    expect(popScore(maskOf((x, y) => x > 150 && x < 170 && y > 150 && y < 170), grey(120)).score).toBe(0);
    expect(popScore(maskOf((x, y) => x > 10 && x < 310 && y > 10 && y < 310), grey(120)).score).toBe(0);
    expect(popScore(maskOf(car), grey(10)).score).toBe(0);
  });
  it("the model's input and output", () => {
    const t = popInput(grey(255));
    expect(t.length).toBe(3 * S * S);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    const b = popMaskBytes([0.2, 0.6, 1]);
    expect([b[0], b[2]]).toEqual([0, 255]); expect(Math.abs(b[1] - 127.5)).toBeLessThanOrEqual(0.5);
  });
});

describe("subject pop: a steady picture at the shot's start", () => {
  it("the same picture is steady; another scene is not", () => {
    const a = grey(120), b = grey(126), night = grey(30);
    expect(popSteady(a, b)).toBe(true);
    expect(popSteady(a, night)).toBe(false);
  });
});

describe("subject pop: the cut-out", () => {
  it("keeps the largest subject, fills its holes, drops the rest", () => {
    const m = maskOf((x, y) => (car(x, y) && !(x > 140 && x < 180 && y > 180 && y < 220)) || (x > 10 && x < 30 && y > 10 && y < 30));
    const a = popAlpha(m);
    expect(a[200 * S + 100]).toBe(255);   // the subject
    expect(a[200 * S + 160]).toBe(255);   // a hole in it (a window)
    expect(a[20 * S + 20]).toBe(0);       // another, smaller thing
    expect(a[50 * S + 160]).toBe(0);      // the background
  });
});

describe("subject pop: where it goes and how it grows", () => {
  const shots = [{ start: 0, end: 2, type: "cut" }, { start: 2, end: 4 }, { start: 4, end: 5, type: "cut" }, { start: 5, end: 8, type: "cut" }, { start: 8, end: 10, type: "drop" }, { start: 10, end: 10.4, type: "hit" }];
  it("leads into a drop's shot first, never the opening two or a short shot", () => {
    expect(popShots(shots, 0.5)).toEqual([4, 3, 2]);
  });
  it("takes about 4 beats before its shot, after the hook's shot", () => {
    expect(popWindow(shots, 4, 0.5)).toEqual({ t0: 6, t1: 8 });
    expect(popWindow(shots, 2, 0.5).t0).toBe(2);
  });
  it("ends where its shot shows the subject, starts small in the middle", () => {
    const L = popLayer([0.25, 0.5, 0.75, 0.8], [0, 0, 1080, 1920], { w: 1080, h: 1920 }, { t0: 6, t1: 8 });
    expect(L.x).toBeCloseTo(0.5); expect(L.y).toBeCloseTo(0.65); expect(L.s).toBeCloseTo(0.5);
    expect(popAt(L, 6)).toEqual({ x: 0.5, y: 0.56, s: 0.2 });
    const end = popAt(L, 8); expect(end.s).toBeCloseTo(0.5); expect(end.y).toBeCloseTo(0.65);
    expect(popAt(L, 6.5).s).toBeLessThan(popAt(L, 7.5).s);
    // a wide clip fitted in a tall Reel (608 px high in the middle): the subject where the fitted picture shows it
    const F = popLayer([0.4, 0.4, 0.6, 0.6], [0, 656, 1080, 608], { w: 1080, h: 1920 }, { t0: 0, t1: 1 });
    expect(F.x).toBeCloseTo(0.5); expect(F.s).toBeCloseTo(0.2); expect(F.y).toBeCloseTo(0.5);
  });
  it("a layer that does not grow stays where it is", () => {
    expect(popAt({ t0: 0, t1: 1, x: 0.3, y: 0.4, s: 0.5 }, 0.5)).toEqual({ x: 0.3, y: 0.4, s: 0.5 });
  });
});
