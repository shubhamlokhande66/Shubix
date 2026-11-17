import { describe, expect, it } from "vitest";
import { clearOfFaces, textBoxEstimate, TEXT_SAFE } from "@shubix/video-engine";

/** Words that never sit on a face (Shared/video-engine/src/clear.ts): both engines move Shubix's own texts with it. */
const W = 1080, H = 1920, o = { W, H };
const box = (y: number, h = 0.06) => ({ x: 0.5, y, w: 0.6, h });

describe("texts clear of faces", () => {
  it("leaves a text where it is when no face is under it", () => {
    expect(clearOfFaces([box(0.3)], [], o)).toBe(0);
    expect(clearOfFaces([box(0.3)], [{ x: 0.5, y: 0.65, s: 0.25 }], o)).toBe(0);    // the face is lower down
    expect(clearOfFaces([box(0.3)], [{ x: 0.08, y: 0.3, s: 0.1 }], o)).toBe(0);     // beside the text, not under it
  });
  it("moves the text the smallest way that clears the face, inside the safe area", () => {
    const f = { x: 0.5, y: 0.34, s: 0.25 }, dy = clearOfFaces([box(0.32)], [f], o);
    expect(dy).not.toBe(0);
    const y = 0.32 + dy, fh = 0.25 * W / H * 1.35;
    expect(y + 0.03 <= f.y - fh * 0.6 || y - 0.03 >= f.y + fh * 0.4).toBe(true);
    expect(y - 0.03).toBeGreaterThanOrEqual(TEXT_SAFE.top - 1e-6);
    expect(y + 0.03).toBeLessThanOrEqual(TEXT_SAFE.bottom + 1e-6);
  });
  it("clears every face seen while the text shows (a face that moves)", () => {
    const faces = [0.3, 0.33, 0.36].map((y) => ({ x: 0.5, y, s: 0.2 })), dy = clearOfFaces([box(0.33)], faces, o), y = 0.33 + dy;
    for (const f of faces) { const fh = 0.2 * W / H * 1.35; expect(y + 0.03 <= f.y - fh * 0.6 + 0.02 || y - 0.03 >= f.y + fh * 0.4 - 0.02).toBe(true); }
  });
  it("moves a template's parts together", () => {
    const parts = [box(0.3, 0.05), box(0.37, 0.04)], dy = clearOfFaces(parts, [{ x: 0.5, y: 0.33, s: 0.3 }], o);
    expect(dy).not.toBe(0);   // one number for the whole group: the parts keep their distance
  });
  it("covers as little as it can when no place is clear (a face filling the frame)", () => {
    const dy = clearOfFaces([box(0.4)], [{ x: 0.5, y: 0.45, s: 1 }], o);
    expect(Number.isFinite(dy)).toBe(true);
    expect(0.4 + dy - 0.03).toBeGreaterThanOrEqual(TEXT_SAFE.top - 1e-6);
  });
  it("estimates a text's size like the studio draws it", () => {
    const short = textBoxEstimate("WOW", 1, false, 0.5, 0.3, W, H), long = textBoxEstimate("THE BEST DAY OF THE WHOLE SUMMER TRIP TO GOA", 1, false, 0.5, 0.3, W, H);
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.w).toBeLessThanOrEqual(0.82 + 0.06);   // wraps at 82% of the width
    expect(long.h).toBeGreaterThan(short.h);           // more lines
    expect(textBoxEstimate("🔥", 1, true, 0.5, 0.3, W, H).w).toBeCloseTo(1080 * 0.16 * 1.1 / W);
  });
});
