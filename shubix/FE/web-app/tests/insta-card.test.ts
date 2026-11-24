import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { instaCardStart } from "../../../Shared/video-engine/src/instaCard";

const SR = 22050;
const src = fs.readFileSync(path.resolve(__dirname, "../../../Shared/video-engine/src/instaCard.ts"), "utf8");
const shape: number[] = JSON.parse(/const SHAPE = (\[[^\]]+\])/.exec(src)![1]);

/** `secs` of music, then what Instagram adds: 0.4 s of silence, its sound, silence (3.6 s from the sound to the end) */
function saved(secs: number, card = true, silence = 2.4) {
  const music = Math.round(secs * SR), x = new Float32Array(music + (card ? Math.round((0.42 + 1.2 + silence) * SR) : 0));
  for (let i = 0; i < music; i++) x[i] = 0.4 * Math.sin(i * 0.11) * (0.6 + 0.4 * Math.sin(i / 3000));
  if (card) { const a = music + Math.round(0.42 * SR), hop = Math.round(0.02 * SR); shape.forEach((v, k) => { for (let i = 0; i < hop; i++) x[a + k * hop + i] = 0.7 * v * Math.sin(i * 0.3); }); }
  return x;
}

describe("the card Instagram adds to a saved Reel", () => {
  it("is found, and the Reel ends where it begins", () => {
    for (const s of [8, 15.37, 40]) expect(Math.abs(instaCardStart(saved(s), SR)! - s)).toBeLessThan(0.06);
  });
  it("is not seen where it is not: music, silence, a fade, the sound with music under its silence", () => {
    expect(instaCardStart(saved(20, false), SR)).toBeNull();
    expect(instaCardStart(new Float32Array(20 * SR), SR)).toBeNull();
    const faded = saved(20, false); for (let i = 0; i < 4 * SR; i++) faded[faded.length - 1 - i] *= i / (4 * SR);
    expect(instaCardStart(faded, SR)).toBeNull();
    const under = saved(12); for (let i = 0; i < under.length; i++) under[i] += 0.1 * Math.sin(i * 0.2);
    expect(instaCardStart(under, SR)).toBeNull();
    expect(instaCardStart(new Float32Array(10), SR)).toBeNull();
  });
  it("is cut off the song and the Reel to copy on the website, and off the song in the Android app", () => {
    const web = fs.readFileSync(path.resolve(__dirname, "../components/studio/engine.ts"), "utf8"), app = fs.readFileSync(path.resolve(__dirname, "../../mobile-app/lib/nativeEngine.ts"), "utf8");
    expect(web).toContain("const cut = noInstaCard(whole, m)");
    expect(web).toContain("dur = Math.min(dur, end)");
    expect(app).toContain("instaCardStart(mono, sampleRate)");
  });
});
