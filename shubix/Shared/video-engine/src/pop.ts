/**
 * Subject pop: the subject of a shot (a car, a bike, a person, a shop's sign) cut out of the shot's first frame, shown
 * small in the middle of the frame while the shot before it plays on, darker, behind it; it grows slowly to its own size
 * and place, and the Reel cuts to its shot there, so the subject seems to come out of the picture and become it. Creators'
 * car Reels do this before the drop.
 *
 * Pure, so both engines make it alike: the website's (components/studio/engine.ts) and the Android app's
 * (engine/brain/core.ts). The mask is U²-Net small (u2netp.onnx, Apache-2.0: BE/api/src/server/vision/data), run on the
 * phone: the page's vision worker, or ONNX Runtime for Android (SubjectPop.kt).
 */

export const POP_SIDE = 320;
export const POP_MODEL = "u2netp.onnx";
const MEAN = [0.485, 0.456, 0.406], SD = [0.229, 0.224, 0.225];

/** POP_SIDE x POP_SIDE RGBA pixels as the model's input: 1 x 3 x side x side, ImageNet's mean and spread */
export function popInput(rgba: ArrayLike<number>, side = POP_SIDE): Float32Array {
  const n = side * side, t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) t[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / SD[c];
  return t;
}

/** the model's first output (side x side) as 0..255, stretched from its lowest to its highest value */
export function popMaskBytes(raw: ArrayLike<number>): Uint8Array {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < raw.length; i++) { const v = raw[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const out = new Uint8Array(raw.length), k = hi - lo > 1e-6 ? 255 / (hi - lo) : 0;
  for (let i = 0; i < raw.length; i++) out[i] = Math.round((raw[i] - lo) * k);
  return out;
}

/** the largest subject in a mask (the pixels over half): which pixels, how many, its box in pixels */
function mainPart(mask: Uint8Array, side: number) {
  const label = new Int32Array(side * side), stack: number[] = [];
  let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] < 128 || label[s]) continue;
    next++; let size = 0; label[s] = next; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, x = p % side, y = (p - x) / side; size++;
      if (x > 0 && !label[p - 1] && mask[p - 1] >= 128) { label[p - 1] = next; stack.push(p - 1); }
      if (x < side - 1 && !label[p + 1] && mask[p + 1] >= 128) { label[p + 1] = next; stack.push(p + 1); }
      if (y > 0 && !label[p - side] && mask[p - side] >= 128) { label[p - side] = next; stack.push(p - side); }
      if (y < side - 1 && !label[p + side] && mask[p + side] >= 128) { label[p + side] = next; stack.push(p + side); }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  let x0 = side, y0 = side, x1 = -1, y1 = -1;
  if (best) for (let p = 0; p < label.length; p++) if (label[p] === best) { const x = p % side, y = (p - x) / side; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { label, id: best, size: bestSize, x0, y0, x1, y1 };
}

export type PopFind = { score: number; cover: number; box: [number, number, number, number] };

/** How well a frame gives a cut-out, 0 (none) to 1: one whole subject, not cut by the frame's sides, compact, from a
 * tenth to half of the frame, the mask sure of itself, not a dark title card. `rgba`: the same frame (for its light). */
export function popScore(mask: Uint8Array, rgba?: ArrayLike<number>, side = POP_SIDE): PopFind {
  const n = side * side, m = mainPart(mask, side), none: PopFind = { score: 0, cover: 0, box: [0, 0, 1, 1] };
  if (!m.id) return none;
  let sure = 0, edge = 0, light = 0;
  for (let p = 0; p < n; p++) {
    const v = mask[p]; if (v < 38 || v > 217) sure++;
    if (m.label[p] !== m.id) continue;
    const x = p % side, y = (p - x) / side; if (x < 3 || x > side - 4 || y < 3 || y > side - 4) edge++;
    if (rgba) light += 0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2];
  }
  const cover = m.size / n, bw = m.x1 - m.x0 + 1, bh = m.y1 - m.y0 + 1, fill = m.size / (bw * bh);
  const box: [number, number, number, number] = [m.x0 / side, m.y0 / side, (m.x1 + 1) / side, (m.y1 + 1) / side];
  if (cover < 0.06 || cover > 0.5 || bh < side * 0.15 || bw < side * 0.15) return { ...none, cover, box };
  if (rgba && light / m.size < 30) return { ...none, cover, box };   // a dark title card or a logo on black
  const touch = Math.min(1, (edge / (2 * side)) * 2);
  return { score: +((sure / n) * fill * (1 - touch)).toFixed(3), cover: +cover.toFixed(3), box };
}

/** The cut-out's alpha (side x side, 0..255): the subject only (its holes filled), with the mask's own soft edge. */
export function popAlpha(mask: Uint8Array, side = POP_SIDE): Uint8Array {
  const n = side * side, m = mainPart(mask, side), out = new Uint8Array(n);
  if (!m.id) return out;
  // outside: what the frame's sides reach without crossing the subject; the rest is the subject or a hole in it
  const outside = new Uint8Array(n), stack: number[] = [];
  const seed = (p: number) => { if (!outside[p] && m.label[p] !== m.id) { outside[p] = 1; stack.push(p); } };
  for (let i = 0; i < side; i++) { seed(i); seed(n - side + i); seed(i * side); seed(i * side + side - 1); }
  while (stack.length) {
    const p = stack.pop()!, x = p % side, y = (p - x) / side;
    if (x > 0) seed(p - 1); if (x < side - 1) seed(p + 1); if (y > 0) seed(p - side); if (y < side - 1) seed(p + side);
  }
  const soft = (v: number) => { const a = Math.max(0, Math.min(1, (v / 255 - 0.3) / 0.4)); return Math.round(255 * a * a * (3 - 2 * a)); };
  for (let p = 0; p < n; p++) {
    if (!outside[p]) { out[p] = m.label[p] === m.id ? Math.max(soft(mask[p]), 200) : 255; continue; }
    // the soft edge: outside pixels next to the subject keep the mask's own fall-off
    const x = p % side, y = (p - x) / side;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      const q = (y + dy) * side + (x + dx);
      if (y + dy >= 0 && y + dy < side && x + dx >= 0 && x + dx < side && m.label[q] === m.id) { near = true; break; }
    }
    out[p] = near ? soft(mask[p]) : 0;
  }
  return out;
}

/** Is the picture steady from the shot's first frame to a moment later (`a`, `b`: RGBA, side x side)? A cut inside the
 * clip right there (a scene change, a whip) would show something else than the cut-out: no pop on such a shot. */
export function popSteady(a: ArrayLike<number>, b: ArrayLike<number>, side = POP_SIDE): boolean {
  const g = 16, cell = side / g; let diff = 0;
  for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++) {
    let la = 0, lb = 0, n = 0;
    for (let y = Math.floor(gy * cell); y < Math.floor((gy + 1) * cell); y += 2) for (let x = Math.floor(gx * cell); x < Math.floor((gx + 1) * cell); x += 2) {
      const i = (y * side + x) * 4; la += 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; lb += 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]; n++;
    }
    diff += Math.abs(la - lb) / Math.max(1, n);
  }
  return diff / (g * g) < 22;
}

type Shot = { start: number; end: number; type?: string };

/** The shots a pop may lead into, best first (at most `most`): a drop's shot, then a hit's, then the longest; never the
 * opening two (the hook's), each long enough to show the subject (2 beats, 0.8 s), with time before it for the pop. */
export function popShots(shots: Shot[], period: number, most = 4): number[] {
  const beat = period > 0 ? period : 0.5, rank: Record<string, number> = { drop: 0, hit: 1, break: 3, cut: 2 };
  const ok = shots.map((s, i) => i).filter((i) => i >= 2 && shots[i].end - shots[i].start >= Math.max(0.8, 2 * beat) && shots[i].start - shots[1].start >= 1);
  return ok.sort((a, b) => (rank[shots[a].type || "cut"] ?? 2) - (rank[shots[b].type || "cut"] ?? 2) || (shots[b].end - shots[b].start) - (shots[a].end - shots[a].start) || a - b).slice(0, most);
}

/** the time the pop takes: about 4 beats (1.2 to 2.6 s) before its shot, after the hook's shot */
export function popWindow(shots: Shot[], i: number, period: number) {
  const t1 = shots[i].start, len = Math.max(1.2, Math.min(2.6, 4 * (period > 0 ? period : 0.5)));
  return { t0: Math.max(shots[1] ? shots[1].start : 0, t1 - len), t1 };
}

export type PopGrow = { s: number; x: number; y: number };
export type PopLayer = { t0: number; t1: number; x: number; y: number; s: number; grow: PopGrow; shade: number; fin: number; fout: number };

/** The layer of a pop: the cut-out (the frame's `box`, 0..1) ends where its shot shows it (`rect`: where the shot puts
 * its whole picture at its start, [x, y, w, h] in the Reel's pixels, as the engine's layerOf gives it), and starts at 40%
 * of that size a little below the middle. */
export function popLayer(box: [number, number, number, number], rect: [number, number, number, number], reel: { w: number; h: number }, win: { t0: number; t1: number }): PopLayer {
  const [px, py, dw, dh] = rect;
  const X0 = (px + box[0] * dw) / reel.w, X1 = (px + box[2] * dw) / reel.w, Y0 = (py + box[1] * dh) / reel.h, Y1 = (py + box[3] * dh) / reel.h;
  return { t0: win.t0, t1: win.t1, x: (X0 + X1) / 2, y: (Y0 + Y1) / 2, s: Math.max(0.05, X1 - X0), grow: { s: 0.4, x: 0.5, y: 0.56 }, shade: 0.45, fin: 0.15, fout: 0 };
}

/** Where a growing layer is at `t`: its size and middle, from the start (grow: share of its size, place) to its own;
 * slow at first, as a creator's pop (an ease in and out). A layer that does not grow is where it is. */
export function popAt(L: { t0: number; t1: number; x: number; y: number; s: number; grow?: PopGrow | null }, t: number) {
  const g = L.grow; if (!g) return { x: L.x, y: L.y, s: L.s };
  const a = Math.max(0, Math.min(1, (t - L.t0) / Math.max(1e-3, L.t1 - L.t0))), e = a * a * (3 - 2 * a);
  return { x: g.x + (L.x - g.x) * e, y: g.y + (L.y - g.y) * e, s: L.s * (g.s + (1 - g.s) * e) };
}
