import { describe, expect, it } from "vitest";
import { textBoxEstimate, TEXT_SAFE } from "@mobile/video-engine";
import { world } from "./edit-repairs.test";

/** Shubix's own texts move off a face (core.ts clearTexts, as the website's engine.ts; Shared/video-engine clear.ts). */
type Ov = { text: string; size: number; emoji?: boolean; x: number; y: number; y0?: number; auto?: boolean; aiIntent?: string };
async function reel(face?: { x: number; y: number; s: number }) {
  const w = world(4, 7, { face });
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
  await w.e.call("choose", { text: "auto" });   // opening words: None by default (2026-11-28), Auto chosen
  const ES = (w.e.host() as unknown as { ES: { overlays: Ov[] } }).ES;
  await w.e.call("state");   // what the app is given: the texts are placed by then
  return ES.overlays.filter((o) => o.auto || o.aiIntent);
}
const W = 1080, H = 1920;
const overlap = (o: Ov, f: { x: number; y: number; s: number }) => {
  const b = textBoxEstimate(o.text, o.size, !!o.emoji, o.x, o.y, W, H), fh = f.s * W / H * 1.35;
  const h = Math.min(b.y + b.h / 2, f.y + fh * 0.4) - Math.max(b.y - b.h / 2, f.y - fh * 0.6), w = Math.min(b.x + b.w / 2, f.x + f.s / 2) - Math.max(b.x - b.w / 2, f.x - f.s / 2);
  return h > 0 && w > 0;
};

describe("Shubix's texts on Android stay off faces", () => {
  it("moves the opening words off a face that sits where they would be, and keeps them in the safe area", async () => {
    const plain = await reel();
    expect(plain.length).toBeGreaterThan(0);
    for (const o of plain) expect(o.y).toBe(o.y0 ?? o.y);   // no face: they stay where the template puts them
    const first = plain[0], face = { x: first.x, y: first.y, s: 0.3 };
    // (a face changes the edit a little, and with it which opening words come: what matters is where they end up)
    const moved = await reel(face);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.some((o) => o.y0 !== undefined && o.y !== o.y0)).toBe(true);
    for (const o of moved) {
      expect(overlap(o, face)).toBe(false);
      const b = textBoxEstimate(o.text, o.size, !!o.emoji, o.x, o.y, W, H);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(TEXT_SAFE.top - 1e-6);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(TEXT_SAFE.bottom + 1e-6);
    }
    // a template's parts move together: the gaps between them are kept
    if (moved.length > 1) expect(+(moved[1].y - moved[0].y).toFixed(3)).toBe(+(moved[1].y0! - moved[0].y0!).toFixed(3));
  });
});
