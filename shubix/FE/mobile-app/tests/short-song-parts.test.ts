import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

// A Reel's song (under 40 beats): bass coming in for a few bars, then going, is the song's change, and gets a cut there
// (QA 2026-11-18: an 18 s song, bass in at 7.7 s and out at 10.4 s, and one soft shot over both). A bass that comes and
// goes every few beats (a tabla or dhol loop) is the song's pattern: no parts from it. engine.ts songParts is the same.
type Host = { brain: Record<string, any> };
const SR = 8000, P = 0.75;
function track(bassOn: (t: number) => boolean, len = 18) {
  const mono = new Float32Array(len * SR);
  for (let i = 0; i < mono.length; i++) {
    const t = i / SR, ph = (t % P) / P;
    const hat = Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-ph * 30) * 0.3;   // the same loudness all through
    const bass = bassOn(t) ? Math.sin(2 * Math.PI * 60 * t) * 0.35 : 0;
    mono[i] = hat + bass + Math.sin(2 * Math.PI * 900 * t) * 0.05;
  }
  return mono;
}
const beats = Array.from({ length: 23 }, (_, k) => 0.5 + k * P);
async function partsOf(mono: Float32Array) {
  const w = world(2, 3);
  const { brain } = w.e.host() as unknown as Host;
  return brain.songParts(mono, SR, beats) as { t: number; ty: string }[];
}

describe("A short song's parts", () => {
  it("bass in for a few bars, then out: a drop and a break", async () => {
    const parts = await partsOf(track((t) => t >= 7.25 && t < 11.0));
    expect(parts.some((x) => x.ty === "drop" && Math.abs(x.t - 7.25) < 0.8)).toBe(true);
    expect(parts.some((x) => x.ty === "break" && Math.abs(x.t - 11.0) < 0.8)).toBe(true);
  });
  // the bass gone for three beats and back (QA 2026-11-19: out at 11.52 s, back at 12.51 s): the return is a moment of its own,
  // not dropped for being near the break; the break on its own beat (a return the 8-beat rule also finds is put on its bar line)
  it("bass in, out for three beats, back: a break on its beat, and the return", async () => {
    const parts = await partsOf(track((t) => t >= 5.0 && !(t >= 11.0 && t < 13.25)));
    expect(parts.some((x) => x.ty === "break" && Math.abs(x.t - 11.0) < 0.1)).toBe(true);
    expect(parts.some((x) => x.ty !== "break" && Math.abs(x.t - 13.25) < 0.8)).toBe(true);
  });
  it("bass on and off every bar (a loop): no parts from it in the middle", async () => {
    // (the 8-beat rule may still see one at the very start, where its window is short: older than this rule)
    const parts = await partsOf(track((t) => Math.floor(t / (P * 4)) % 2 === 1));
    expect(parts.filter((x) => x.t > 4).length).toBe(0);
  });
});
