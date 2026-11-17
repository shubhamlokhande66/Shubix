import { describe, expect, it } from "vitest";
import { fitLook, hueOf, pictureOf, pictureWords } from "@mobile/video-engine";

// The AI director's look for a shot, checked against the picture (Shared/video-engine lookFit.ts).
const person = { b: 0.5, subject: { x: 0.6, y: 0.2, w: 0.3, h: 0.4 }, person: true, aspect: 16 / 9 };

describe("the director's look fitted to the picture", () => {
  it("moves a circle mask onto the subject and makes it big enough, its keyframes with it", () => {
    const { look, fixed } = fitLook({ mk: { s: "circle", x: 0.3, y: 0.5, w: 0.2, h: 0.2, a: 0, f: 0.04, inv: false, c: "#000000" },
      kx: [{ t: 0, mk: { x: 0.3, y: 0.5 } }, { t: 1, mk: { x: 0.35, y: 0.5, w: 0.1 } }] }, person);
    expect(fixed).toContain("mask");
    expect(look.mk.x).toBeCloseTo(0.75, 2);
    expect(look.mk.y).toBeCloseTo(0.38, 2);
    expect(look.mk.w).toBeGreaterThanOrEqual(0.3 * 1.4);
    expect(look.mk.h).toBeGreaterThanOrEqual(0.4 * (16 / 9) * 1.4);
    expect(look.kx[0].mk.x).toBeCloseTo(0.75, 2);
    expect(look.kx[1].mk.x).toBeCloseTo(0.8, 2);
    expect(look.kx[1].mk.w).toBeGreaterThanOrEqual(0.42);
  });
  it("keeps a mask already round the subject, and a band shape where it is", () => {
    const on = { s: "rect", x: 0.75, y: 0.38, w: 0.5, h: 1.2, a: 0, f: 0, inv: false, c: "#000000" };
    expect(fitLook({ mk: on }, person)).toEqual({ look: { mk: on }, fixed: [] });
    const film = { s: "film", x: 0.5, y: 0.5, w: 1, h: 0.5, a: 0, f: 0, inv: false, c: "#000000" };
    expect(fitLook({ mk: film }, person).look.mk).toEqual(film);
  });
  it("never hides the subject with an inverted mask", () => {
    expect(fitLook({ mk: { s: "circle", x: 0.75, y: 0.4, w: 0.3, h: 0.3, inv: true } }, person).look.mk).toBeUndefined();
    expect(fitLook({ mk: { s: "circle", x: 0.15, y: 0.85, w: 0.2, h: 0.2, inv: true } }, person).look.mk).toBeDefined();
  });
  it("keys a green screen only where there is one, in its colour", () => {
    const ck = { c: "#ff00ff", tol: 0.35, bg: "#000000" };
    expect(fitLook({ ck }, { ...person, backdrop: "none" }).look.ck).toBeUndefined();
    expect(fitLook({ ck }, { ...person, backdrop: "green" }).look.ck.c).toBe("#00b140");
    expect(fitLook({ ck: { ...ck, c: "#22cc33" } }, { ...person, backdrop: "green" }).look.ck.c).toBe("#22cc33");
    expect(fitLook({ ck: { ...ck, c: "#22cc33" } }, { ...person, backdrop: "blue" }).look.ck.c).toBe("#0047bb");
    expect(fitLook({ ck }, { b: 0.5 }).look.ck).toEqual(ck);   // the picture not looked at: kept
  });
  it("keeps curves rising and near the shot, never darker on a dark shot", () => {
    const flip = fitLook({ cv: { m: [1, 0.75, 0.5, 0.25, 0] } }, { b: 0.5 }).look.cv.m;
    for (let i = 1; i < 5; i++) expect(flip[i]).toBeGreaterThanOrEqual(flip[i - 1]);
    const dark = fitLook({ cv: { m: [0, 0.15, 0.4, 0.7, 1] }, bri: -0.2 }, { b: 0.1 });
    expect(dark.look.cv).toBeUndefined();   // only darkening: nothing left of it
    expect(dark.look.bri).toBeUndefined();
    expect(dark.fixed).toEqual(expect.arrayContaining(["curves", "light"]));
    const cast = fitLook({ cv: { r: [0, 0.5, 0.8, 0.9, 1] } }, { b: 0.5 }).look.cv.r;
    expect(cast[1]).toBeCloseTo(0.4, 3);
    const lift = { cv: { m: [0.05, 0.3, 0.55, 0.8, 1] } };
    expect(fitLook(lift, { b: 0.1 })).toEqual({ look: lift, fixed: [] });
  });
  it("keeps skin its own colour on people", () => {
    const { look, fixed } = fitLook({ hsl: { orange: [0.6, -1, 0.5], green: [0.8, 0.3, 0] } }, person);
    expect(look.hsl.orange).toEqual([0.05, -0.4, 0.2]);
    expect(look.hsl.green).toEqual([0.3, 0.3, 0]);
    expect(fixed).toContain("hsl");
    expect(fitLook({ hsl: { orange: [0.2, 0, 0] } }, { b: 0.5 }).look.hsl.orange).toEqual([0.2, 0, 0]);
  });
});

describe("a shot's picture", () => {
  const frames = [{ t: 1, subject: { x: 0.1, y: 0.1, w: 0.4, h: 0.5 }, person: true, backdrop: "green" }, { t: 5, subject: null, person: false, backdrop: null }];
  it("from the ranking AI's frames inside the shot, else the nearest", () => {
    const p = pictureOf(frames, null, 0.5, 2, 0.4);
    expect(p).toMatchObject({ b: 0.4, subject: { x: 0.1, y: 0.1, w: 0.4, h: 0.5 }, person: true, backdrop: "green" });
    expect(pictureOf(frames, null, 4.5, 6).backdrop).toBe("none");
    expect(pictureOf([{ t: 1, subject: null }], null, 0, 2).backdrop).toBeUndefined();   // an older answer: not known
  });
  it("from the faces when the AI has not looked", () => {
    const p = pictureOf(null, [{ t: 1, n: 1, fx: 0.5, fy: 0.3, fs: 0.2 }, { t: 1.5, n: 0 }], 0, 2);
    expect(p.person).toBe(true);
    expect(p.subject!.x).toBeCloseTo(0.4, 3);
  });
  it("in words for the director", () => {
    expect(pictureWords({ b: 0.1, subject: { x: 0.123, y: 0.2, w: 0.3, h: 0.4 }, backdrop: "blue" })).toEqual({ light: "dark", subject: { x: 0.12, y: 0.2, w: 0.3, h: 0.4 }, backdrop: "blue" });
    expect(pictureWords({ backdrop: "none" })).toEqual({});
  });
  it("reads a colour's hue", () => {
    expect(hueOf("#00ff00")!.h).toBe(120);
    expect(hueOf("nope")).toBeNull();
  });
});
