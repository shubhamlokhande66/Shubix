/**
 * "Copy a Reel": what the reader knows only by its look and the studio has under its own name. Before 2026-11-24 these
 * were read and only written to the learning log; now the copied shot gets them.
 */
/** transitions: a push to a side, a zoom out, a light leak / film burn */
export const REF_TRX = ["slideleft", "slideright", "zoomout", "burn"];
/** effects inside a shot: RGB split, mirror, strobe */
export const REF_FX = ["rgbpulse", "mirror", "strobe"];

/** the studio's transition for a shot of the copied Reel: the one seen by its look when the plan has it, else its kind's */
export function refTrOf(m: { tr?: string; trx?: string }, kinds: Record<string, string>, may: (k: string) => boolean): string {
  if (m.tr === "start") return "hard";
  if (m.trx && REF_TRX.includes(m.trx) && may(m.trx)) return m.trx;
  return kinds[m.tr ?? ""] || "hard";
}

/** a copied camera move (scale, sideways and up/down as parts of the frame, degrees), kept over the whole frame: a move that
 * would uncover an edge (a zoom out under full size, a slide, a turn) is enlarged, and made smaller when that needs over 1.6x */
export function coverMove<K extends { s: number; x: number; y: number; r: number }>(keys: K[]): K[] {
  const need = (k: { x: number; y: number; r: number }) => { const a = (Math.abs(k.r) * Math.PI) / 180; return (Math.cos(a) + Math.sin(a) * 1.78) * (1 + 2 * Math.max(Math.abs(k.x), Math.abs(k.y))); };
  for (let m = 1; ; m -= 0.1) {
    const v = keys.map((k) => ({ ...k, s: 1 + (k.s - 1) * m, x: k.x * m, y: k.y * m, r: k.r * m }));
    const f = Math.max(1, ...v.map((k) => need(k) / k.s));
    if (f <= 1.6 || m <= 0.1) return v.map((k) => ({ ...k, s: +Math.min(2.5, k.s * f).toFixed(4), x: +k.x.toFixed(4), y: +k.y.toFixed(4), r: +k.r.toFixed(3) }));
  }
}

/** one flash reads as two jumps (into white, out of it): two flashes within 0.25 s are one cut, at the first; a run of them
 * joins for at most 0.4 s. In time order; changes the list. */
export function joinFlashes<C extends { t: number; kind?: string; odd?: unknown }>(cuts: C[]): C[] {
  for (let i = 0; i < cuts.length; i++) {
    if (cuts[i].kind !== "flash") continue;
    let last = cuts[i].t;
    while (i + 1 < cuts.length && cuts[i + 1].kind === "flash" && cuts[i + 1].t - last < 0.25 && cuts[i + 1].t - cuts[i].t <= 0.4) { last = cuts[i + 1].t; if (cuts[i + 1].odd) cuts[i].odd = cuts[i + 1].odd; cuts.splice(i + 1, 1); }
  }
  return cuts;
}
/** how sharp a small grey frame is */
export function sharpOfY(Y: ArrayLike<number>, W: number): number {
  let s = 0, n = 0;
  for (let q = 0; q + W + 1 < Y.length; q += 2) { s += Math.abs(Y[q + 1] - Y[q]) + Math.abs(Y[q + W] - Y[q]); n++; }
  return n ? s / n : 0;
}
/** where a Reel goes soft from one shot into another (every frame's sharpness; how different the pictures 8 frames before and after are) */
export function blurCuts(sharp: ArrayLike<number>, far: ArrayLike<number>, fps: number): number[] {
  const out: number[] = [];
  for (let i = 8; i + 8 < sharp.length; i++) {
    const side = Math.min(sharp[i - 8], sharp[i + 8]);
    if (side < 0.015 || sharp[i] >= 0.5 * side || far[i] < 0.1) continue;
    let low = true; for (let j = i - 6; j <= i + 6; j++) if (sharp[j] < sharp[i] || (j < i && sharp[j] === sharp[i])) low = false;
    if (low && (!out.length || i / fps - out[out.length - 1] > 0.4)) out.push(i / fps);
  }
  return out;
}
/** how warm a picture's light is (RGBA): red over blue, 0-1 */
export function warmOf(d: ArrayLike<number>): number {
  let s = 0, n = 0;
  for (let i = 0; i + 3 < d.length; i += 12) { s += d[i] - d[i + 2]; n++; }
  return n ? s / n / 255 : 0;
}
