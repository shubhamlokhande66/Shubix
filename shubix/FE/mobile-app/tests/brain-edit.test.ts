import { describe, expect, it } from "vitest";
import { createEditBrain } from "../engine/brain/edit";

// the edit core with no page at all: its state is a plain object, what stays in the page comes through hooks
describe("the edit core outside the browser", () => {
  const brain = () => { const ES: Record<string, unknown> = { seed: 42, beats: [0.5, 1, 1.5, 2] }; return { ES, ...createEditBrain(ES, {}) }; };

  it("loads and gives its functions", () => {
    const b = brain();
    for (const name of ["beatEdit", "scoreWindow", "finishTransitions", "noFlashCuts", "colorHist"]) expect(typeof b[name as keyof typeof b]).toBe("function");
  });
  it("reads a clip's frame from plain bytes, with no picture", () => {
    const SW = 8, SH = 8, b = createEditBrain({}, { SW, SH });
    const flat = (v: number, w: number, h: number) => new Uint8ClampedArray(w * h * 4).fill(v);
    const dark = b.frameStats(flat(10, SW, SH), flat(10, 128, 72), null);
    const light = b.frameStats(flat(200, SW, SH), flat(200, 128, 72), dark.lum);
    expect(dark.row.m).toBe(0);                     // nothing before it: no motion
    expect(light.row.m).toBeGreaterThan(0.5);       // the whole frame changed
    expect(light.row.b).toBeGreaterThan(dark.row.b);
    expect(dark.row.sh).toBeCloseTo(0);             // a flat frame has no edges
  });
  it("keeps its random numbers in its state, so a Reel can be made again", () => {
    const a = brain(), first = [a.rng(), a.rng()], seedAfter = a.ES.seed, c = brain();
    expect([c.rng(), c.rng()]).toEqual(first);
    expect(seedAfter).not.toBe(42);
  });
});

// "In my order": which clip each of the song's shots shows. Each clip gets its share of the Reel's time, as an editor
// lays clips out; a share of the NUMBER of shots gave the first clip a 7 s intro and a later one 0.6 s of a fast part.
describe("In my order: each clip its share of the Reel's time", () => {
  const TAIL = 0.15;
  const slots = (lens: number[], drop = -1) => { let t = 0; return lens.map((l, i) => { const s = { start: t, end: t + l, type: i === drop ? "drop" : "cut" }; t += l; return s; }); };
  const run = (lens: number[], clips: number[], drop = -1) => {
    const ES: Record<string, unknown> = { seed: 1, beats: [], plan: slots(lens, drop), sources: clips.map((dur) => ({ dur })) };
    const b = createEditBrain(ES, { TAIL }), seq = b.seqSlots(lens.length) as number[];
    const time = clips.map((_, j) => lens.reduce((a, l, i) => a + (seq[i] === j ? l : 0), 0));
    return { seq, time };
  };
  // a calm intro of two long shots, then the song cuts fast: 2 x 3.6 s, then 22 x 0.6 s (20.4 s), 12 clips of 15 s
  const song = [3.6, 3.6, ...Array(22).fill(0.6)], clips = Array(12).fill(15);

  it("no clip holds a third of the Reel while another flashes by", () => {
    const { seq, time } = run(song, clips);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));            // the person's order, never back to a clip
    expect(new Set(seq).size).toBe(12);                              // every clip is shown
    expect(Math.max(...time)).toBeLessThanOrEqual(3.6 + 1e-9);       // (it was 7.2 s: both intro shots to the first clip)
    expect(Math.min(...time.slice(2))).toBeGreaterThanOrEqual(1.2 - 1e-9);   // (it was 0.6 s)
  });
  it("a drop's cut stays a cut between two clips", () => {
    const { seq } = run(song, clips, 7);                             // the drop is the cut into shot 7
    expect(seq[7]).not.toBe(seq[6]);
  });
  it("a short clip is not given more than its footage fills", () => {
    const { time } = run(Array(12).fill(2), [1, 15, 15, 15]);        // 24 s of song; the first clip is 1 s long
    expect(time[0]).toBeLessThanOrEqual((1 - TAIL) / 0.4 + 1e-9);    // at its slowest (0.4x) it fills 2.1 s
    expect(time[1] + time[2] + time[3]).toBeGreaterThanOrEqual(21.8);
  });
  it("fewer shots than clips: the first clips, one shot each, as before", () => {
    expect(run([2, 2, 2], [10, 10, 10, 10, 10]).seq).toEqual([0, 1, 2]);
  });
  it("the same clips and song give the same answer", () => {
    expect(run(song, clips).seq).toEqual(run(song, clips).seq);
  });
});

// The pace of creators' beat Reels (19 measured: web-app/scripts/studio-references): the opening holds about 4 beats, the
// last fifth slows down, a drop keeps its cut. Auto only.
describe("the pace of a beat Reel, as creators cut it", () => {
  const P = 0.5, D = 20;   // 120 BPM, a 20 s Reel
  const beats = Array.from({ length: 40 }, (_, i) => i * P);
  const cutEvery = (len: number, drop = -1) => { const out = []; for (let t = 0, i = 0; t < D - 1e-9; t += len, i++) out.push({ start: t, end: Math.min(D, t + len), type: i === drop ? "drop" : "cut" }); return out; };
  const pace = (p: { start: number; end: number; type: string }[], mode = "auto") => {
    const ES: Record<string, unknown> = { seed: 1, mode, period: P, beats, buf: { duration: D } };
    return createEditBrain(ES, {}).paceWell(p) as { start: number; end: number; type: string }[];
  };
  it("holds the opening shot about 4 beats", () => {
    const p = pace(cutEvery(0.5));
    expect(p[0].end).toBeGreaterThanOrEqual(1.9);
    expect(p[0].end).toBeLessThanOrEqual(3.1);
  });
  it("slows down in the last fifth: no shot there shorter than two beats", () => {
    const p = pace(cutEvery(0.5));
    for (const s of p.filter((x) => x.start >= 0.8 * D)) expect(s.end - s.start).toBeGreaterThanOrEqual(2 * P - 1e-9);
    expect(p.at(-1)!.end).toBe(D);
    const mid = p.filter((x) => x.start > 4 && x.start < 14);
    expect(Math.min(...mid.map((x) => x.end - x.start))).toBeCloseTo(0.5);   // the middle keeps its pace
  });
  it("a drop keeps its cut, even in the opening", () => {
    const p = pace(cutEvery(0.5, 2));                                       // the drop at 1 s
    expect(p.some((s) => s.type === "drop" && Math.abs(s.start - 1) < 1e-9)).toBe(true);
  });
  it("Fast and Smooth are left as they are", () => {
    const p = cutEvery(0.5);
    expect(pace(p.map((s) => ({ ...s })), "fast")).toEqual(p);
  });
  it("covers the whole Reel with no gap", () => {
    const p = pace(cutEvery(0.75));
    expect(p[0].start).toBe(0);
    p.slice(1).forEach((s, i) => expect(s.start).toBeCloseTo(p[i].end));
    expect(p.at(-1)!.end).toBe(D);
  });
});
