import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";
import { velocitySpeed, rampSpeed, curveSpeed, leadSpeed } from "../engine/brain/pure";

// A song with parts: a hi-hat on every beat (0.75 s, 80 BPM), the bass in at 6 s, out at 12 s, back at 15 s (a Reel song's shape).
const SR = 22050, P = 0.75;
function partsSong(len = 24) {
  const mono = new Float32Array(len * SR);
  for (let i = 0; i < mono.length; i++) {
    const t = i / SR, ph = (t % P) / P, bass = t >= 6 && !(t >= 12 && t < 15);
    mono[i] = Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-ph * 30) * 0.3 + (bass ? Math.sin(2 * Math.PI * 60 * t) * 0.35 * (0.6 + 0.4 * Math.exp(-ph * 8)) : 0) + Math.sin(2 * Math.PI * 900 * t) * 0.04;
  }
  return mono;
}
type Shot = { start: number; end: number; type: string; tr: string; trLead?: number };
type ES = { edit: Shot[]; beats: number[]; seqOn: boolean };
async function reel(seed: number) {
  const w = world(12, seed, { mono: partsSong(), sr: SR });
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths });
  const host = w.e.host() as unknown as { ES: ES };
  host.ES.seqOn = false; await w.e.call("ready");
  return host;
}

describe("transitions as an editor sets them (QA 2026-11-19, checked against ChatGPT's plan for a Reel song)", () => {
  it("a drop gets a transition that hits (a flash, a whip, a zoom), never a soft one, and the plain cuts stay plain", async () => {
    for (const seed of [2, 5, 9]) {
      const { ES } = await reel(seed);
      const drops = ES.edit.filter((e, i) => i > 0 && e.type === "drop");
      expect(drops.length).toBeGreaterThan(0);
      expect(drops.some((e) => e.tr !== "hard")).toBe(true);
      expect(drops.every((e) => !["dissolve", "dip", "blur", "luma"].includes(e.tr))).toBe(true);
      // rationed: most cuts are plain, about one transition for every 7 s of Reel
      const fancy = ES.edit.filter((e, i) => i > 0 && e.tr !== "hard").length, len = ES.edit[ES.edit.length - 1].end - ES.edit[0].start;
      expect(fancy).toBeLessThanOrEqual(Math.max(1, Math.round(len / 7)) + 1);
    }
  }, 300000);
  it("a transition ends on its beat: the shot starts before the beat by the transition's length", async () => {
    let landed = 0;
    for (const seed of [2, 5, 9]) {
      const { ES } = await reel(seed);
      for (const e of ES.edit.slice(1)) {
        if (!e.trLead) continue; landed++;
        const at = e.start + e.trLead + 1 / 30, off = Math.min(...ES.beats.map((b) => Math.abs(b - at)));
        expect(off).toBeLessThan(0.045);
      }
    }
    expect(landed).toBeGreaterThan(0);
  }, 300000);
  it("a shot started earlier for its transition moves to its cut, its speed still on its beats (a Reel stood still before cuts: QA 2026-11-23)", () => {
    const len = 2, L = 0.4;
    for (const sp of [velocitySpeed(len, [0.7, 1.3]), rampSpeed(len), curveSpeed(len, { a: 1, b: 2, c: 0.5, d: 1, e: 1.5 })]) {
      const led = leadSpeed(sp, L), r = sp.at(0);
      for (let l = 1 / 30; l < len + L + 0.3; l += 1 / 30) expect(led.pos(l) - led.pos(l - 1 / 30)).toBeGreaterThan(0.004);
      for (const l of [0, 0.5, 1.4, 2]) expect(led.pos(l + L)).toBeCloseTo(r * L + sp.pos(l), 6);   // the moment chosen, on its beat
    }
  });
});
