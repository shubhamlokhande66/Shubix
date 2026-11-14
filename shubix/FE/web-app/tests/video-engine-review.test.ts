import { describe, expect, it } from "vitest";
import { chooseEditTake, describeEditReview, editNeedsAnotherTake, reviewAutonomousEdit, type EditReviewInput, type EditReviewShot } from "../../../Shared/video-engine/src/index";

/** a clean 8-second Reel at 120 BPM: a cut every second, each shot from its own clip, sharp, bright, the opening the strongest */
const beats = Array.from({ length: 17 }, (_, i) => i * 0.5);
const shot = (i: number, over: Partial<EditReviewShot> = {}): EditReviewShot => ({
  start: i, end: i + 1, sourceIndex: i, sourceStart: 2, sourceEnd: 3, kind: "cut",
  sharpness: 1, brightness: 0.5, motion: i === 0 ? 0.9 : 0.5, face: 0.4, effect: "none", transition: "hard", ...over,
});
const clean = (over: Partial<EditReviewInput> = {}): EditReviewInput => ({
  shots: Array.from({ length: 8 }, (_, i) => shot(i)), beats, duration: 8, sourceCount: 8,
  sourceDurations: Array.from({ length: 8 }, () => 10), ...over,
});
const codes = (input: EditReviewInput) => reviewAutonomousEdit(input).issues.map((i) => i.code);

describe("the edit's own review", () => {
  it("passes a clean edit with a full score and exact measurements", () => {
    const r = reviewAutonomousEdit(clean());
    expect(r.status).toBe("pass");
    expect(r.score).toBe(100);
    expect(r.issues).toEqual([]);
    expect(r.repairs).toEqual([]);
    expect(r.metrics.beatSync).toEqual({ cuts: 7, onBeat: 7, ratio: 1, meanOffsetMs: 0, worstOffsetMs: 0 });
    expect(r.metrics.clipCoverage).toEqual({ used: 8, possible: 8, ratio: 1 });
    expect(r.metrics.repeatedFootage).toEqual({ seconds: 0, ratio: 0 });
    expect(r.metrics.shotLength).toEqual({ shortest: 1, longest: 1, median: 1 });
    expect(r.metrics.drops).toBeNull();
  });

  it("measures a cut that is off the beat, in milliseconds, and names the shot", () => {
    const shots = clean().shots;
    shots[2] = shot(2, { end: 3.12 }); shots[3] = shot(3, { start: 3.12 });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.status).toBe("warn");
    expect(r.metrics.beatSync).toEqual({ cuts: 7, onBeat: 6, ratio: 0.857, meanOffsetMs: 17.1, worstOffsetMs: 120 });
    const issue = r.issues.find((i) => i.code === "cut-off-beat")!;
    expect(issue.shot).toBe(3);
    expect(issue.value).toBe(120);
    expect(r.repairs).toEqual(["snap-cut-to-beat"]);
    expect(r.score).toBe(98);
  });

  it("counts a cut placed one frame early as on the beat when told the lead", () => {
    const lead = 1 / 30;
    const shots = Array.from({ length: 8 }, (_, i) => shot(i, { start: i ? i - lead : 0, end: i === 7 ? 8 : i + 1 - lead }));
    expect(reviewAutonomousEdit(clean({ shots, cutLead: lead })).metrics.beatSync!.onBeat).toBe(7);
    // without the lead a 33 ms early cut is still inside the 40 ms tolerance; a tighter one catches it
    expect(reviewAutonomousEdit(clean({ shots, toleranceMs: 20 })).metrics.beatSync!.onBeat).toBe(0);
  });

  it("skips the beat checks without a song instead of failing them", () => {
    const r = reviewAutonomousEdit(clean({ beats: [] }));
    expect(r.metrics.beatSync).toBeNull();
    expect(r.status).toBe("pass");
  });

  it("wants a cut on every drop", () => {
    const r = reviewAutonomousEdit(clean({ drops: [4, 5.5] }));
    expect(r.metrics.drops).toEqual({ total: 2, hit: 1, ratio: 0.5 });
    expect(r.issues.filter((i) => i.code === "drop-missed").map((i) => i.value)).toEqual([5.5]);
    expect(r.repairs).toEqual(["cut-on-drop"]);
  });

  it("finds footage shown twice and how much of it", () => {
    const shots = clean().shots;
    shots[5] = shot(5, { sourceIndex: 1, sourceStart: 2.4, sourceEnd: 3.4 });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.metrics.repeatedFootage).toEqual({ seconds: 0.6, ratio: 0.075 });
    expect(r.issues.find((i) => i.code === "footage-repeated")!.shot).toBe(5);
    expect(codes(clean({ shots }))).toContain("clips-unused");
  });

  it("tells a jump inside one clip from one take cut on the beat", () => {
    const jump = clean().shots; jump[4] = shot(4, { sourceIndex: 3, sourceStart: 7, sourceEnd: 8 });
    expect(reviewAutonomousEdit(clean({ shots: jump })).metrics.sameClipJumps).toBe(1);
    const take = clean().shots; take[4] = shot(4, { sourceIndex: 3, sourceStart: 3, sourceEnd: 4 });
    expect(reviewAutonomousEdit(clean({ shots: take })).metrics.sameClipJumps).toBe(0);
  });

  it("does not call one clip cut to the beat a fault", () => {
    const shots = Array.from({ length: 8 }, (_, i) => shot(i, { sourceIndex: 0, sourceStart: i, sourceEnd: i + 1 }));
    const r = reviewAutonomousEdit(clean({ shots, sourceCount: 1, sourceDurations: [10] }));
    expect(r.metrics.sameClipJumps).toBe(0);
    expect(r.metrics.clipCoverage).toEqual({ used: 1, possible: 1, ratio: 1 });
    expect(r.status).toBe("pass");
  });

  it("finds soft and dark shots, only among the shots that were measured", () => {
    const shots = clean().shots;
    shots[1] = shot(1, { sharpness: 0.3 }); shots[2] = shot(2, { brightness: 0.04 });
    shots[6] = shot(6, { sharpness: undefined, brightness: undefined });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.metrics.weakShots).toEqual({ measured: 7, soft: 1, dark: 1, ratio: 0.286 });
    expect(r.repairs).toEqual(["pick-sharper-moment", "pick-brighter-moment"]);
    expect(reviewAutonomousEdit(clean({ shots: clean().shots.map((s) => ({ ...s, sharpness: undefined, brightness: undefined })) })).metrics.weakShots).toBeNull();
  });

  it("fails an edit that needs more footage than a clip has, and warns of a shot slowed too far", () => {
    const shots = clean().shots;
    shots[3] = shot(3, { sourceStart: 9.5, sourceEnd: 10.5 });
    shots[6] = shot(6, { sourceStart: 2, sourceEnd: 2.3 });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.status).toBe("fail");
    expect(r.issues.find((i) => i.code === "footage-overrun")).toMatchObject({ shot: 3, value: 0.5, severity: "error" });
    expect(r.issues.find((i) => i.code === "slow-stretch")).toMatchObject({ shot: 6, value: 0.3 });
    expect(r.metrics.stretchedShots).toBe(1);
  });

  it("does not call a freeze frame a stretch", () => {
    const shots = clean().shots; shots[6] = shot(6, { sourceStart: 2, sourceEnd: 2 });
    expect(codes(clean({ shots }))).not.toContain("slow-stretch");
  });

  it("fails a timeline with a hole, shots at the same time, or the wrong length", () => {
    const gap = clean().shots; gap[4] = shot(4, { start: 4.5 });
    expect(reviewAutonomousEdit(clean({ shots: gap })).issues.find((i) => i.code === "timeline-gap")).toMatchObject({ shot: 4, value: 0.5 });
    const over = clean().shots; over[4] = shot(4, { start: 3.5 });
    expect(codes(clean({ shots: over }))).toContain("timeline-overlap");
    const r = reviewAutonomousEdit(clean({ duration: 10 }));
    expect(r.status).toBe("fail");
    expect(r.issues.map((i) => i.code)).toEqual(["timeline-length"]);
    expect(r.repairs).toEqual(["rebuild-timeline"]);
  });

  it("stops at a shot whose numbers are not real, without inventing measurements", () => {
    const shots = clean().shots; shots[2] = shot(2, { start: Number.NaN });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.status).toBe("fail");
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: "invalid-shot", shot: 2 });
    expect(r.metrics.beatSync).toBeNull();
    expect(reviewAutonomousEdit(clean({ shots: [] })).status).toBe("fail");
    expect(reviewAutonomousEdit(clean({ duration: 0 })).status).toBe("fail");
  });

  it("notices an opening weaker than the rest of the Reel", () => {
    const shots = clean().shots; shots[0] = shot(0, { motion: 0.1, face: 0 });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.metrics.hook).toEqual({ strength: 0.25, medianOfRest: 0.57 });
    expect(r.issues.find((i) => i.code === "weak-hook")!.shot).toBe(0);
    expect(reviewAutonomousEdit(clean()).metrics.hook).toEqual({ strength: 0.77, medianOfRest: 0.57 });
  });

  it("says what is wrong with a locked shot but never proposes to change it", () => {
    const shots = clean().shots; shots[1] = shot(1, { sharpness: 0.3, locked: true });
    const r = reviewAutonomousEdit(clean({ shots }));
    expect(r.issues.find((i) => i.code === "soft-shot")!.repairable).toBe(false);
    expect(r.repairs).toEqual([]);
    expect(r.score).toBe(97.5);
  });

  it("notes the same transition four times in a row and an effect on nearly every shot", () => {
    const run = clean().shots.map((s, i) => (i >= 1 && i <= 4 ? { ...s, transition: "whip" } : s));
    expect(codes(clean({ shots: run }))).toEqual(["transition-run"]);
    const three = clean().shots.map((s, i) => (i >= 1 && i <= 3 ? { ...s, transition: "whip" } : s));
    expect(codes(clean({ shots: three }))).toEqual([]);
    const fx = clean().shots.map((s, i) => (i < 7 ? { ...s, effect: "zoom" } : s));
    const r = reviewAutonomousEdit(clean({ shots: fx }));
    expect(r.issues.map((i) => i.code)).toEqual(["effects-everywhere"]);
    expect(r.status).toBe("pass");   // notes alone are not something a viewer would call a fault
    expect(r.score).toBe(97);
  });

  it("takes a run of very short shots on a drum roll as the edit meant it, and only a shorter one as a slip", () => {
    // 161 BPM, a cut on every half beat (0.186 s), as the beat edit makes on a dholki roll
    const n = 16, step = 0.186, roll = Array.from({ length: n }, (_, i) => shot(i, { start: i * step, end: (i + 1) * step, sourceStart: 2, sourceEnd: 2 + step }));
    const input = (shots: EditReviewShot[]) => ({ shots, beats: shots.map((s) => s.start), duration: shots[shots.length - 1].end, sourceCount: n });
    expect(reviewAutonomousEdit(input(roll)).issues.map((i) => i.code)).toEqual([]);
    const slip = roll.map((s, i) => (i === 5 ? { ...s, end: s.start + 0.1 } : i === 6 ? { ...s, start: roll[5].start + 0.1 } : s));
    const r = reviewAutonomousEdit(input(slip));
    expect(r.issues.filter((i) => i.code === "flash-shot").map((i) => i.shot)).toEqual([5]);
    expect(r.repairs).toEqual(["merge-shot"]);
  });

  it("caps what one kind of issue can cost, so the score stays readable", () => {
    const shots = Array.from({ length: 30 }, (_, i) => shot(i, { start: i * 0.5 + (i ? 0.1 : 0), end: i === 29 ? 15 : i * 0.5 + 0.6, sourceIndex: i }));
    const r = reviewAutonomousEdit({ shots, beats: Array.from({ length: 31 }, (_, i) => i * 0.5), duration: 15, sourceCount: 30 });
    expect(r.metrics.beatSync!.onBeat).toBe(0);
    expect(r.issues.filter((i) => i.code === "cut-off-beat")).toHaveLength(29);
    expect(r.score).toBe(80);
  });

  it("asks for another take only for a fault a take can change, on a shot that may be changed", () => {
    expect(editNeedsAnotherTake(reviewAutonomousEdit(clean()))).toBe(false);
    const soft = clean().shots; soft[1] = shot(1, { sharpness: 0.3 });
    expect(editNeedsAnotherTake(reviewAutonomousEdit(clean({ shots: soft })))).toBe(true);
    const locked = clean().shots; locked[1] = shot(1, { sharpness: 0.3, locked: true });
    expect(editNeedsAnotherTake(reviewAutonomousEdit(clean({ shots: locked })))).toBe(false);
    // a cut off the beat is the same in every take: another take cannot help
    const off = clean().shots; off[2] = shot(2, { end: 3.12 }); off[3] = shot(3, { start: 3.12 });
    expect(editNeedsAnotherTake(reviewAutonomousEdit(clean({ shots: off })))).toBe(false);
  });

  it("puts the review in one line for the Reel's log", () => {
    expect(describeEditReview(reviewAutonomousEdit(clean({ drops: [4] })))).toBe("100/100 · 7/7 cuts on the beat · 1/1 drops cut");
    const shots = clean().shots; shots[1] = shot(1, { sharpness: 0.3 });
    expect(describeEditReview(reviewAutonomousEdit(clean({ shots })))).toBe("97.5/100 · 7/7 cuts on the beat · 1 weak shot");
  });
});

describe("the edit tries again", () => {
  // a take is the shot list itself; `soft` shots of it are soft
  const takeWith = (soft: number, locked = false) => clean().shots.map((s, i) => (i >= 1 && i <= soft ? { ...s, sharpness: 0.3, locked } : s));
  const review = (shots: EditReviewShot[]) => reviewAutonomousEdit(clean({ shots }));
  const maker = (softPerTake: number[]) => { const made: number[] = []; return { made, make: (k: number) => { made.push(k); return takeWith(softPerTake[k - 1]); } }; };

  it("makes one take when the first has nothing another take could better", () => {
    const m = maker([0, 0, 0]), c = chooseEditTake(m.make, review);
    expect(m.made).toEqual([1]);
    expect([c.kept, c.tried]).toEqual([1, 1]);
    expect(c.review!.score).toBe(100);
  });
  it("keeps the take with the best review, out of three at most", () => {
    const m = maker([3, 1, 2]), c = chooseEditTake(m.make, review);
    expect(m.made).toEqual([1, 2, 3]);
    expect([c.kept, c.tried]).toEqual([2, 3]);
    expect(c.take).toEqual(takeWith(1));
    expect(c.review!.score).toBe(97.5);
  });
  it("stops as soon as a take has no fault left", () => {
    const m = maker([2, 0, 0]), c = chooseEditTake(m.make, review);
    expect(m.made).toEqual([1, 2]);
    expect([c.kept, c.tried]).toEqual([2, 2]);
  });
  it("keeps the first take on a tie, and when the later ones are worse", () => {
    expect(chooseEditTake(maker([2, 2, 2]).make, review).kept).toBe(1);
    expect(chooseEditTake(maker([1, 3, 2]).make, review).kept).toBe(1);
  });
  it("does not try again for faults only on locked shots", () => {
    const made: number[] = [], c = chooseEditTake((k) => { made.push(k); return takeWith(2, true); }, review);
    expect(made).toEqual([1]);
    expect(c.review!.score).toBe(95);
  });
  it("honours the most takes allowed", () => {
    expect(chooseEditTake(maker([3, 2, 1, 0]).make, review, 1).tried).toBe(1);
    expect(chooseEditTake(maker([3, 2, 1, 0]).make, review, 4).kept).toBe(4);
    expect(chooseEditTake(maker([3, 2, 1, 0]).make, review, Number.NaN).tried).toBe(1);
  });
  it("never loses the edit to a review that cannot be made", () => {
    const first = chooseEditTake(maker([2, 0]).make, () => { throw new Error("no samples"); });
    expect([first.kept, first.tried, first.review]).toEqual([1, 1, null]);
    // the second take's review fails: the first take stays, the third is still tried
    let n = 0;
    const c = chooseEditTake(maker([2, 0, 1]).make, (shots) => { if (++n === 2) return null; return review(shots); });
    expect([c.kept, c.tried]).toEqual([3, 3]);
  });
});

