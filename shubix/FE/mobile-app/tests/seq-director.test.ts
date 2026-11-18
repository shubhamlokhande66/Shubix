import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

// "In my order" with clips shorter than the song's shots: the cuts are moved to fit the clips after Shubix AI's plan is
// looked for. The plan was asked for those moved cuts (dirKey), so it must still be used: its transitions and effects
// reach the Reel. Seen on QA 2026-11-18: a paid AI Reel came out all hard cuts and no effects (the plan's key did not
// match the cuts before they moved). The website's engine.ts makeEditNow does the same (engine-parity keeps them alike).
type Shot = { start: number; end: number; tr: string; efx: string; trByDir?: boolean; fxByDir?: boolean };
type Host = { ES: Record<string, any>; brain: Record<string, any> };

async function seqReel(nClips: number, seed: number) {
  const w = world(nClips, seed);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
  const { ES, brain: EH } = w.e.host() as unknown as Host;
  ES.seqOn = true; EH.makeEditNow();
  return { ES, EH };
}

describe("In my order: Shubix AI's plan is used after the cuts move to fit the clips", () => {
  it("the cuts move (the case this covers)", async () => {
    const { ES, EH } = await seqReel(3, 7);
    const before = EH.adaptPlan().map((s: Shot) => s.start.toFixed(2)).join(",");
    expect(ES.plan.map((s: Shot) => s.start.toFixed(2)).join(",")).not.toBe(before);
  });

  it("the AI's transitions and effects are in the Reel", async () => {
    const { ES, EH } = await seqReel(3, 7);
    ES.aiOn = true;
    const n = ES.plan.length;
    ES.director = { key: EH.dirKey(), story: "", slots: Array.from({ length: n }, (_, i) => ({ tr: i ? "flash" : "hard", fx: "bounce", sp: "normal" })) };
    EH.makeEditNow();
    const edit = ES.edit as Shot[];
    expect(edit.length).toBe(n);
    expect(edit.slice(1).every((e) => e.tr === "flash" || e.trByDir)).toBe(true);
    expect(edit.filter((e) => e.efx === "bounce").length).toBeGreaterThan(0);
  });
});
