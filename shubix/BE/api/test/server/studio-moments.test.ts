// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ManagedProvider } from "../../src/server/ai";
import { candidates, findMoments, MomentsIn, pickApart, plainScore, sentences } from "../../src/server/studio/moments";

/** Clips from a long video: the words in sentences, whole-sentence moments inside the length, the best ones apart,
 * Shubix AI's judgement when it answers and the plain scoring when it does not. */

// a 10-minute talk: a sentence every ~6 s (13 words at ~2.4 words a second), a 2 s pause every 10 sentences
function talk(minutes = 10) {
  const words: { text: string; start: number; end: number }[] = [];
  let t = 0, n = 0;
  while (t < minutes * 60) {
    const hook = n % 7 === 0;
    const line = hook ? "Why do most people never save money? Here is the one mistake you make every month." : "and then we talked about the plan for the shop and the new stock for the week.";
    for (const w of line.split(" ")) { words.push({ text: w, start: +t.toFixed(2), end: +(t + 0.35).toFixed(2) }); t += 0.42; }
    t += n % 10 === 9 ? 2 : 0.3;
    n++;
  }
  return words;
}
const input = (o: Partial<{ length: "short" | "medium" | "long"; count: number }> = {}) => MomentsIn.parse({ words: talk(), duration: 600, key: "video-1", ...o });
function fake(answer: (user: string) => unknown) {
  const calls: string[] = [];
  const p = { async structured(_s: string, user: string, schema: { parse: (v: unknown) => unknown }) { calls.push(user); return schema.parse(answer(user)); } };
  return { p: () => p as unknown as ManagedProvider, calls };
}

describe("sentences and candidates", () => {
  it("splits on full stops, question marks and long pauses", () => {
    const s = sentences([{ text: "Hello", start: 0, end: 0.4 }, { text: "there.", start: 0.5, end: 0.9 }, { text: "Next", start: 1, end: 1.3 }, { text: "one", start: 3, end: 3.3 }]);
    expect(s.map((x) => x.text)).toEqual(["Hello there.", "Next", "one"]);
  });
  it("keeps every candidate inside the length and on sentence edges", () => {
    const all = sentences(talk());
    for (const len of ["short", "medium", "long"] as const) {
      const c = candidates(all, len);
      const [min, max] = { short: [15, 35], medium: [30, 60], long: [55, 90] }[len];
      expect(c.length).toBeGreaterThan(5);
      for (const x of c) {
        expect(x.end - x.start).toBeGreaterThanOrEqual(min);
        expect(x.end - x.start).toBeLessThanOrEqual(max);
        expect(all.some((s) => s.start === x.start)).toBe(true);
      }
    }
  });
  it("scores a question hook above a weak start", () => {
    const strong = sentences([{ text: "Why", start: 0, end: 0.3 }, { text: "is", start: 0.4, end: 0.6 }, { text: "this?", start: 0.7, end: 1 }]);
    const weak = sentences([{ text: "and", start: 0, end: 0.3 }, { text: "so", start: 0.4, end: 0.6 }, { text: "on", start: 0.7, end: 1 }]);
    expect(plainScore(strong)).toBeGreaterThan(plainScore(weak));
  });
  it("never picks two moments that share time", () => {
    const got = pickApart([{ start: 0, end: 30 }, { start: 10, end: 40 }, { start: 40, end: 70 }], (x) => -x.start, 3);
    expect(got).toEqual([{ start: 0, end: 30 }, { start: 40, end: 70 }]);
  });
});

describe("finding the clips", () => {
  it("without Shubix AI: the plain picks, best first, apart, as many as asked", async () => {
    const r = await findMoments(input({ count: 5 }), false);
    expect(r.by).toBe("simple");
    expect(r.clips).toHaveLength(5);
    for (let i = 1; i < r.clips.length; i++) expect(r.clips[i - 1].score).toBeGreaterThanOrEqual(r.clips[i].score);
    for (const a of r.clips) for (const b of r.clips) if (a !== b) expect(a.start >= b.end - 1 || b.start >= a.end - 1).toBe(true);
    expect(r.clips[0].text).toMatch(/Why do most people/); // the hooks win without the AI too
  });
  it("with Shubix AI: its scores, titles and hooks decide", async () => {
    const f = fake((user) => {
      const ids = [...user.matchAll(/#(\d+) /g)].map((m) => Number(m[1]));
      return { clips: ids.map((id) => ({ id, score: id === ids[ids.length - 1] ? 99 : 10, title: `T${id}`, hook: `H${id}`, reason: "r" })) };
    });
    const r = await findMoments(input({ count: 3 }), true, f.p);
    expect(r.by).toBe("ai");
    expect(f.calls).toHaveLength(1);
    expect(r.clips[0].title).toMatch(/^T\d+$/);
    expect(r.clips[0].score).toBeGreaterThan(r.clips[1].score);
  });
  it("an odd AI answer falls back to the plain picks", async () => {
    const r = await findMoments(input(), true, fake(() => ({ clips: [] })).p);
    expect(r.by).toBe("simple");
    expect(r.clips.length).toBeGreaterThan(0);
  });
  it("refuses too little talking and clips longer than the talk", async () => {
    expect(MomentsIn.safeParse({ words: talk().slice(0, 5), duration: 10, key: "k123" }).success).toBe(false);
    const short = MomentsIn.parse({ words: talk(0.2), duration: 12, key: "k123", length: "long" });
    await expect(findMoments(short, false)).rejects.toMatchObject({ code: "MOMENTS_TOO_SHORT" });
  });
});
