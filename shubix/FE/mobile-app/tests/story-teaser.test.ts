import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORY_ON } from "@mobile/video-engine";
import { createEditBrain } from "../engine/brain/edit";

// The teaser (shared/video-engine story.ts) in the brain: "In my order" opens on the clips' strongest unused moment
// for about a second when the clips' own opening is clearly weaker, then plays the clips from the start. It is switched
// off (STORY_ON.teaser) until the hook score matches editors' openings; these tests switch it on to check how it works.
const normal = { pos: (l: number) => l, at: () => 1 };
/** a clip of `dur` s read every 0.1 s: movement `m(t)`, mid light, typical sharpness */
const clip = (dur: number, m: (t: number) => number) => ({
  dur, shMed: 1, faces: [], scenes: [],
  samples: Array.from({ length: Math.floor(dur * 10) }, (_, k) => ({ t: k / 10, m: m(k / 10), b: 0.5, sh: 1, cx: 0.5, gx: 0, gy: 0 })),
});
const burst = (from: number, to: number, base = 0.15) => (t: number) => (t >= from && t <= to ? 1 : base);

function run(opening: (t: number) => number, more: Record<string, unknown> = {}) {
  const sources = [clip(8, opening), clip(8, () => 0.3), clip(20, (t) => Math.max(burst(3, 4.5)(t), burst(14, 15.5)(t)))];
  const plan = [{ start: 0, end: 3.6, type: "cut", sp: normal }, { start: 3.6, end: 6, type: "cut", sp: normal }, { start: 6, end: 9, type: "cut", sp: normal }];
  const ES: Record<string, any> = { seed: 7, beats: Array.from({ length: 19 }, (_, k) => k / 2), plan, sources, mode: "auto", seqFloor: 0.4, ...more };
  const b: any = createEditBrain(ES, { SEQ_FAST: 0.5, SPEED: { normal }, isPartStart: () => false });
  const seq = [0, 1, 2], res: any[] = new Array(plan.length), gmax = 1;
  b.seqPick(seq, res, gmax);
  const did = b.teaserOpen(seq, res, gmax);
  return { did, ES, seq, res };
}

describe("the teaser, switched off", () => {
  it("changes nothing", () => {
    const { did, ES } = run(() => 0.05);
    expect(did).toBe(false);
    expect(ES.plan).toHaveLength(3);
  });
});

describe("the teaser that opens an In my order Reel (switched on)", () => {
  beforeAll(() => { STORY_ON.teaser = true; });
  afterAll(() => { STORY_ON.teaser = false; });
  it("opens on the strongest moment the Reel does not show elsewhere, then the clips from the start", () => {
    const { did, ES, seq, res } = run(() => 0.05);   // the first clip is almost still
    expect(did).toBe(true);
    expect(ES.plan).toHaveLength(4);
    expect(ES.plan[0].end).toBeCloseTo(1.5 - 1 / 30);   // on a beat about a second in
    expect(ES.plan[1].start).toBe(ES.plan[0].end);
    expect(ES.plan[1].end).toBe(3.6);                   // the first clip keeps the rest of its shot
    expect(seq).toEqual([2, 0, 1, 2]);
    expect(res[0]).toMatchObject({ src: 2, teaser: true });
    expect(res[1].src).toBe(0);
    // an action burst, and not the one the third clip's own shot shows
    const t = res[0], own = res[3], tEnd = t.in + (ES.plan[0].end - ES.plan[0].start);
    expect(t.in >= 2.5 && tEnd <= 5 || t.in >= 13.5 && tEnd <= 16).toBe(true);
    expect(tEnd + 0.3 <= own.in || t.in >= own.in + 3 + 0.3).toBe(true);
  });
  it("not when the clips' own opening is strong", () => {
    const { did, ES } = run(() => 1);
    expect(did).toBe(false);
    expect(ES.plan).toHaveLength(3);
  });
  it("not with Shubix AI on, nor for a copied Reel", () => {
    expect(run(() => 0.05, { aiOn: true }).did).toBe(false);
    expect(run(() => 0.05, { mode: "copy" }).did).toBe(false);
  });
});
