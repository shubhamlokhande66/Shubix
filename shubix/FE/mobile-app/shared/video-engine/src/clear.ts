/**
 * Words that never sit on a face: Shubix's own texts (the opening words, Shubix AI's texts) are moved up or down, as a
 * group, just enough to clear the faces on screen while they show, and kept inside Instagram's safe area. An editor
 * does the same by eye. Pure: the website's studio and the Android app's brain give it the same numbers.
 *
 * Every position is a fraction of the frame (x of its width, y of its height), the centre of the thing.
 */

/** a face on screen: its centre and its width (fraction of the frame's width) */
export type ClearFace = { x: number; y: number; s: number };
/** a text's box: its centre and its size */
export type ClearBox = { x: number; y: number; w: number; h: number };

/** Instagram's own buttons and caption: the top 220 and the bottom 450 of a 1920 px tall Reel */
export const TEXT_SAFE = { top: 220 / 1920, bottom: 1 - 450 / 1920 } as const;

/**
 * How big a text is, without drawing it: the studio's own sizes (the font is 7.5% of the frame's short side times the
 * text's size, a sticker 16%; lines wrap at 82% of the width; 0.6 of the font size a letter, bold capitals).
 */
export function textBoxEstimate(text: string, size: number, emoji: boolean, x: number, y: number, W: number, H: number): ClearBox {
  const fs = Math.min(W, H * 0.5625) * (emoji ? 0.16 : 0.075) * (size || 1);
  if (emoji) return { x, y, w: (fs * 1.1) / W, h: (fs * 1.1) / H };
  const chars = Math.max(1, [...String(text || "")].length), wide = chars * fs * 0.6, maxW = W * 0.82;
  const lines = Math.max(1, Math.ceil(wide / maxW));
  return { x, y, w: (Math.min(maxW, wide) + fs * 0.8) / W, h: (lines * fs * 1.18 + fs * 0.6) / H };
}

/** a face's box on screen: a little taller than wide (the head, with hair and chin), and a margin around it */
function faceRect(f: ClearFace, W: number, H: number, margin: number) {
  const w = f.s, h = (f.s * W / H) * 1.35;
  return { l: f.x - w / 2 - margin, r: f.x + w / 2 + margin, t: f.y - h * 0.6 - margin, b: f.y + h * 0.4 + margin };
}

/**
 * How far to move a group of texts (fraction of the frame's height; 0 = stays) so that none of them covers a face that
 * is on screen while they show. The smallest move that clears every face wins; when nothing clears them all, the place
 * covering the least of them. Never outside the safe area, never when nothing is covered.
 */
export function clearOfFaces(boxes: ClearBox[], faces: ClearFace[], o: { W: number; H: number; top?: number; bottom?: number; margin?: number }): number {
  if (!boxes.length || !faces.length) return 0;
  const top = o.top ?? TEXT_SAFE.top, bottom = o.bottom ?? TEXT_SAFE.bottom, margin = o.margin ?? 0.015;
  const U = {
    l: Math.min(...boxes.map((b) => b.x - b.w / 2)), r: Math.max(...boxes.map((b) => b.x + b.w / 2)),
    t: Math.min(...boxes.map((b) => b.y - b.h / 2)), b: Math.max(...boxes.map((b) => b.y + b.h / 2)),
  };
  const rects = faces.filter((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && f.s > 0).map((f) => faceRect(f, o.W, o.H, margin))
    .filter((r) => r.r > U.l && r.l < U.r);   // only the faces beside the text's columns matter
  const covered = (dy: number) => rects.reduce((sum, r) => {
    const h = Math.min(U.b + dy, r.b) - Math.max(U.t + dy, r.t), w = Math.min(U.r, r.r) - Math.max(U.l, r.l);
    return sum + (h > 0 && w > 0 ? h * w : 0);
  }, 0);
  if (covered(0) === 0) return 0;
  const inSafe = (dy: number) => U.t + dy >= top - 1e-9 && U.b + dy <= bottom + 1e-9;
  // above each face, below each face, and the two ends of the safe area
  const tries = [...rects.flatMap((r) => [r.t - U.b, r.b - U.t]), top - U.t, bottom - U.b].filter(inSafe);
  const clear = tries.filter((dy) => covered(dy) === 0).sort((a, b) => Math.abs(a) - Math.abs(b));
  if (clear.length) return +clear[0].toFixed(4);
  const best = [0, ...tries].filter((dy) => dy === 0 || inSafe(dy)).sort((a, b) => covered(a) - covered(b) || Math.abs(a) - Math.abs(b));
  return +best[0].toFixed(4);
}
