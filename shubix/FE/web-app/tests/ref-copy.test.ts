import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REF_FX, REF_TRX, refTrOf } from "../../../Shared/video-engine/src/refCopy";
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
});
