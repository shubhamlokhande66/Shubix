/** A picture drawn on a canvas as the frame a video player expects: Rec. 709 colours in limited range (black 16, white
 * 235), labelled so. Handed a canvas, the browser's encoder made its own YUV: one computer full range under a "limited"
 * label (every player then cut its darkest and brightest parts: crushed blacks, stronger colours than the preview), another
 * full range with the sRGB curve, which phones, WhatsApp and Instagram show wrongly too (measured in exported Reels,
 * 2026-11-27). Made here, the same on every device. */
export const REC709: VideoColorSpaceInit = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false };

let buf: Uint8Array | null = null;
/** the canvas's picture as I420 (Y, then U and V at half size), Rec. 709 limited range; width and height even */
export function i420Of(g: CanvasRenderingContext2D, w: number, h: number): Uint8Array {
  const data = g.getImageData(0, 0, w, h).data, px = new Uint32Array(data.buffer, data.byteOffset, w * h);   // ABGR, little-endian
  const n = w * h, cw = w >> 1, ch = h >> 1;
  if (!buf || buf.length !== n + 2 * cw * ch) buf = new Uint8Array(n + 2 * cw * ch);
  const out = buf, U = n, V = n + cw * ch;
  // Rec. 709 (Kr 0.2126, Kb 0.0722), limited range, ×256 fixed point; the four pictures of each 2×2 square share one colour
  for (let y = 0; y < h; y += 2) {
    const r0 = y * w, r1 = r0 + w, c0 = (y >> 1) * cw;
    for (let x = 0; x < w; x += 2) {
      const a = px[r0 + x], b = px[r0 + x + 1], c = px[r1 + x], d = px[r1 + x + 1];
      const ra = a & 255, ga = (a >>> 8) & 255, ba = (a >>> 16) & 255;
      const rb = b & 255, gb = (b >>> 8) & 255, bb = (b >>> 16) & 255;
      const rc = c & 255, gc = (c >>> 8) & 255, bc = (c >>> 16) & 255;
      const rd = d & 255, gd = (d >>> 8) & 255, bd = (d >>> 16) & 255;
      out[r0 + x] = (47 * ra + 157 * ga + 16 * ba + 4224) >> 8;
      out[r0 + x + 1] = (47 * rb + 157 * gb + 16 * bb + 4224) >> 8;
      out[r1 + x] = (47 * rc + 157 * gc + 16 * bc + 4224) >> 8;
      out[r1 + x + 1] = (47 * rd + 157 * gd + 16 * bd + 4224) >> 8;
      const R = ra + rb + rc + rd, G = ga + gb + gc + gd, B = ba + bb + bc + bd, k = c0 + (x >> 1);
      out[U + k] = (-26 * R - 86 * G + 112 * B + 131584) >> 10;   // 128 × 1024 + rounding
      out[V + k] = (112 * R - 102 * G - 10 * B + 131584) >> 10;
    }
  }
  return out;
}
