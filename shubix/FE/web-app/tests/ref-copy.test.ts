import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { blurCuts, coverMove, joinFlashes, panelRuns, REF_FX, REF_TRX, refTrOf, warmOf } from "../../../Shared/video-engine/src/refCopy";
import { TR_DUR } from "@shubix/core/lib/shaders";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8").replace(/\r\n/g, "\n");
const web = read("../components/studio/engine.ts"), app = read("../../mobile-app/engine/brain/edit.ts"), api = read("../../../BE/api/src/server/studio/direct.ts");
const KINDS = { hard: "hard", fade: "dip", whip: "whip" }, yes = () => true;

describe("Copy a Reel: what is known only by its look", () => {
  it("is the studio's own transition when the plan has it, else the kind's", () => {
    expect(refTrOf({ tr: "hard", trx: "slideleft" }, KINDS, yes)).toBe("slideleft");
    expect(refTrOf({ tr: "hard", trx: "slideleft" }, KINDS, () => false)).toBe("hard");
    expect(refTrOf({ tr: "fade" }, KINDS, yes)).toBe("dip");
    expect(refTrOf({ tr: "whip", trx: "made-up" }, KINDS, yes)).toBe("whip");
    expect(refTrOf({ tr: "start", trx: "burn" }, KINDS, yes)).toBe("hard");
  });
  it("exists in the studio, and the server keeps it with the speeds", () => {
    for (const t of REF_TRX) { expect(Object.keys(TR_DUR)).toContain(t); expect(api).toContain(`"${t}"`); }
    for (const f of REF_FX) { expect(web).toContain(`${f}:'`); expect(api).toContain(`"${f}"`); }
    expect(api).toMatch(/spd: z\.array/); expect(api).toMatch(/frz: z\.number/);
  });
  it("is copied by both engines alike", () => {
    for (const s of [web, app]) {
      expect(s).toContain("if(REF_TRX.includes(m.trx)) o.trx = m.trx; if(REF_FX.includes(m.fx)) o.fx = m.fx;");
      expect(s).toMatch(/const tr = refTrOf\(m, (EH\.)?REF_TR, k => !(EH\.)?isLocked\('tr', k\)\);/);
      expect(s).toMatch(/if\(REF_FX\.includes\(m\.fx\) && !(EH\.)?isLocked\('fx', m\.fx\)\) s\.efx = m\.fx;/);
    }
  });
  it("never copies the other Reel's words: places wait for the creator's own, and stay out of the video", () => {
    const apply = web.slice(web.indexOf("function refLookApply(R){"), web.indexOf("function refLookApply(R){") + 1800);
    expect(apply).not.toContain("text: x.text"); expect(apply).toContain("ov.ph = true");
    expect(web).toContain("if(ov.ph && (recording || exporting || coverMode)) return;");
    expect(web).toContain("ov.text = ti.value; delete ov.ph;");
  });
  it("two Reels picked in a row: the last one wins", () => {
    expect(web).toContain("await before; if(run !== refRun) return;");
    expect(web).toContain("refProfile = read;");
  });
  it("a copied move never uncovers the frame's edges", () => {
    const need = (k: { x: number; y: number; r: number }) => { const a = Math.abs(k.r) * Math.PI / 180; return (Math.cos(a) + Math.sin(a) * 1.78) * (1 + 2 * Math.max(Math.abs(k.x), Math.abs(k.y))); };
    for (const m of [[[1, 0, 0, 0], [0.6, 0, 0, 0]], [[0.4, 0.6, 0, 0], [2.5, 0, -0.6, 0]], [[1, 0, 0, -60], [1, 0, 0, 60]], [[1, 0.1, 0, 0], [1, -0.1, 0, 4]]]) {
      const v = coverMove(m.map(([s, x, y, r]) => ({ s, x, y, r })));
      for (const k of v) { expect(k.s).toBeGreaterThanOrEqual(need(k) - 0.01); expect(k.s).toBeLessThanOrEqual(2.5); }
    }
    expect(coverMove([{ s: 1, x: 0, y: 0, r: 0 }, { s: 1.2, x: 0, y: 0, r: 0 }])).toEqual([{ s: 1, x: 0, y: 0, r: 0 }, { s: 1.2, x: 0, y: 0, r: 0 }]);
    for (const s of [web, app]) expect(s).toContain("s.ak = coverMove(m.move.map(");
  });
  it("one flash is one cut, not two; a burn's colour is kept; flashes further apart stay", () => {
    const f = (t: number, kind = "flash", odd: unknown = null) => ({ t, kind, odd });
    expect(joinFlashes([f(1.4), f(1.47), f(2.6), f(2.67, "flash", "x")]).map((c) => [c.t, c.odd])).toEqual([[1.4, null], [2.6, "x"]]);
    expect(joinFlashes([f(1), f(1.3), f(2, "hard"), f(2.1)])).toHaveLength(4);
    expect(joinFlashes([f(1), f(1.2), f(1.4), f(1.6)])).toHaveLength(2);
  });
  it("finds a blur-through: soft between two different pictures, not inside one shot", () => {
    const sharp = new Array(60).fill(0.06), far = new Array(60).fill(0.3); for (const i of [29, 30, 31]) sharp[i] = 0.01 + Math.abs(i - 30) * 0.01;
    expect(blurCuts(sharp, far, 30)).toEqual([1]); expect(blurCuts(sharp, new Array(60).fill(0.02), 30)).toEqual([]);
  });
  it("reads warm light", () => { expect(warmOf([255, 150, 40, 255])).toBeGreaterThan(0.5); expect(warmOf([255, 255, 255, 255])).toBe(0); });
  it("reads panels: pieces that change one after another and stay; a moving hand is not one", () => {
    const gx = 16, gy = 28, N = 90, pic = (i: number) => { const o = new Float32Array(gx * gy);
      // black, then three boxes of a bright picture, one every 12 frames (left-top, right-middle, bottom)
      const box = [[0, 0, 7, 9, 20], [8, 10, 15, 18, 32], [0, 19, 15, 27, 44]];
      for (let c = 0; c < o.length; c++) { const x = c % gx, y = (c / gx) | 0; o[c] = box.some(([a, b, cc, d, t]) => i >= t && x >= a && x <= cc && y >= b && y <= d) ? 0.7 : 0.02; } return o; };
    const r = panelRuns(pic, N, gx, gy);
    expect(r).toHaveLength(1); expect(r[0].kind).toBe("panels"); expect(r[0].t0).toBeGreaterThan(0.5); expect(r[0].t1).toBeLessThan(1.6);
    // something moving across a steady shot: it changes and changes back, never stays
    const hand = (i: number) => { const o = new Float32Array(gx * gy).fill(0.4); const x0 = Math.floor(i / 3) % gx; for (let y = 10; y < 16; y++) for (let x = x0; x < Math.min(gx, x0 + 3); x++) o[y * gx + x] = 0.9; return o; };
    expect(panelRuns(hand, N, gx, gy)).toEqual([]);
  });
  it("tells photo boxes over a shot (a food Reel's five boxes) from a panels build", () => {
    const gx = 16, gy = 28, N = 90;
    // a steady shot, then five small boxes of other pictures pop in one after another and stay; the shot shows around them
    const box = [[1, 3, 4, 9, 20], [11, 3, 14, 9, 30], [1, 15, 4, 21, 40], [6, 19, 9, 25, 50], [11, 15, 14, 21, 60]];
    const pic = (i: number) => { const o = new Float32Array(gx * gy);
      for (let c = 0; c < o.length; c++) { const x = c % gx, y = (c / gx) | 0; o[c] = box.some(([a, b, cc, d, t]) => i >= t && x >= a && x <= cc && y >= b && y <= d) ? 0.85 : 0.35 + 0.1 * ((x + y) % 2); } return o; };
    const r = panelRuns(pic, N, gx, gy);
    expect(r).toHaveLength(1); expect(r[0].kind).toBe("boxes"); expect(r[0].area).toBeLessThan(0.45);
    const app = read("../../mobile-app/lib/nativeEngine.ts");
    expect(web).toContain("refBoxesSoon(refProfile);"); expect(app).toContain("await host.brain.photoBoxes(0)");
  });
  it("the panel transitions exist in both engines and the server", () => {
    for (const t of ["panels", "hpanels", "vpanels", "window"]) { expect(Object.keys(TR_DUR)).toContain(t); expect(api).toContain(`"${t}"`); expect(web).toContain(`case '${t}':`); }
    const kt = read("../../mobile-app/modules/shubix-video/android/src/main/java/expo/modules/shubixvideo/StudioTransitions.kt");
    expect(kt).toContain('"panels" to 31f'); expect(kt).toContain('"window" to 34f');
  });
});
