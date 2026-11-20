import { describe, expect, it } from "vitest";
import { activity, dubSegments, placeDub, resample, stretch } from "@/components/studio/dub";

/** AI dub: sentences with their times, a faster voice that keeps its pitch, each sentence where it was said. */
const sine = (hz: number, secs: number, sr = 16000) => Float32Array.from({ length: Math.round(secs * sr) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sr));
const crossings = (x: Float32Array) => { let n = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };

describe("sentences", () => {
  it("ends one on a full stop, a long pause or 150 characters, with the times of its words", () => {
    const w = (text: string, start: number) => ({ text, start, end: start + 0.3 });
    const s = dubSegments([w("Hello", 0), w("friends.", 0.4), w("Today", 1), w("we", 1.4), w("cook", 2.5), w("rice", 2.9)]);
    expect(s.map((x) => x.text)).toEqual(["Hello friends.", "Today we", "cook rice"]);
    expect(s[1]).toMatchObject({ start: 1, end: 1.7 });
    const long = dubSegments(Array.from({ length: 60 }, (_, i) => w("word", i * 0.2)));
    expect(long.every((x) => x.text.length <= 150)).toBe(true);
  });
});

describe("the voice", () => {
  it("speeds up with its pitch kept", () => {
    const x = sine(220, 2), y = stretch(x, 16000, 1.3);
    expect(y.length).toBeCloseTo(x.length / 1.3, -2);
    const hz = crossings(y) / 2 / (y.length / 16000);
    expect(Math.abs(hz - 220)).toBeLessThan(12);
  });
  it("resamples to the Reel's rate", () => {
    expect(resample(sine(100, 1, 24000), 24000, 48000).length).toBe(48000);
  });
});

describe("placing", () => {
  it("starts each sentence where it was said; a long one is sped up to fit before the next", () => {
    const sr = 16000, N = sr * 10;
    const segs = [{ i: 0, start: 1, end: 3, text: "a" }, { i: 1, start: 4, end: 6, text: "b" }];
    const r = placeDub(segs, [{ pcm: sine(200, 3.5), sr }, { pcm: sine(200, 1), sr }], N, sr);
    const act = activity(r.pcm, sr);
    const first = r.pcm.findIndex((v) => Math.abs(v) > 0.01);
    expect(first / sr).toBeGreaterThan(0.97); expect(first / sr).toBeLessThan(1.05);
    expect(r.stretched).toBe(1); // 3.5 s into 3 s of room: sped up (1.19×), not cut
    expect(Math.abs(r.pcm[Math.round(3.97 * sr)])).toBeLessThan(0.02); // silent just before the second sentence
    expect(r.pcm.slice(Math.round(4.1 * sr), Math.round(4.9 * sr)).some((v) => Math.abs(v) > 0.05)).toBe(true);
    expect(act[Math.round(4.5 * sr)]).toBe(1);
    expect(act[Math.round(8 * sr)]).toBe(0);
  });
});
