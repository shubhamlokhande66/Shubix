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
