import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coverMove, REF_FX, REF_TRX, refTrOf } from "../../../Shared/video-engine/src/refCopy";
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
});
