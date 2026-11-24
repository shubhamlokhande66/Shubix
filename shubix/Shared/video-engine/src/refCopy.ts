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
