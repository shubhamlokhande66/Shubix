/**
 * The finish creators give a Reel, measured on 19 of their beat Reels (FE/web-app/scripts/studio-references):
 * - their logo, small in a corner, all through;
 * - an end card: 14 of 19 end on 4 to 6 s of black (median 4.4 s) with their @handle and logo, the rest darken the
 *   last shot under them;
 * - cinematic bars (a wide band in the tall frame);
 * - a colour flash on the strong beats (a dance Reel's frames turn blue, then orange);
 * - black and white until the drop, colour from it.
 * Pure, so both engines (the website's engine.ts and the Android brain) make them alike. The drawing is the layers'
 * (kinds "shade", "bars" and "tint" need no file): the website's drawLayers and the phone's StudioLayers.kt.
 */

export type Brand = { handle: string; logo: boolean; mark: boolean; end: boolean };

/** the @handle as it is shown: one word, an @ in front; "" when there is none */
export function handleOf(raw: string): string {
  const h = String(raw || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@+/, "").replace(/\s+/g, "");
  return h ? "@" + h.slice(0, 30) : "";
}

/** the end card's time: about 15% of the Reel, 2.5 to 4.4 s, starting on a beat when one is near; null: too short a Reel */
export function endCardTime(dur: number, beats: number[] = []): { t0: number; t1: number } | null {
  if (!(dur >= 8)) return null;
  const len = Math.max(2.5, Math.min(4.4, dur * 0.15));
  let t0 = dur - len;
  const near = beats.filter((b) => Math.abs(b - t0) <= 0.35 && dur - b >= 2.3).sort((a, b) => Math.abs(a - t0) - Math.abs(b - t0))[0];
  if (near !== undefined) t0 = near;
  return { t0: +t0.toFixed(3), t1: dur };
}

/** where the logo sits all through: top right, inside the part of the frame Instagram leaves free */
export const MARK = { x: 0.86, y: 0.075, s: 0.15, op: 0.85 };
/** the logo on the end card: in the middle, a little above the @handle; it settles from a little smaller */
export const END_LOGO = { x: 0.5, y: 0.45, s: 0.3, grow: { s: 0.86, x: 0.5, y: 0.45 } };

/** cinematic bars: the band that shows, [top, height] in the frame's pixels (2.39:1 by default; a wide frame gets none) */
export function barsBand(W: number, H: number, ratio = 2.39): [number, number] {
  const h = Math.min(H, W / ratio);
  return [(H - h) / 2, h];
}

/** the colour flashes of a beat Reel: on the strong beats, at least 0.4 s apart, blue then orange in turn */
export const TINTS = ["#2F6BFF", "#FF7A1A"];
export function tintPulses(hits: number[], from: number, to: number): [number, string][] {
  const out: [number, string][] = []; let last = -Infinity;
  for (const t of [...hits].sort((a, b) => a - b)) if (t >= from && t < to && t - last >= 0.4) { out.push([+t.toFixed(3), TINTS[out.length % 2]]); last = t; }
  return out;
}
/** how strong the colour is at `t` (0..1) and which: it comes in at once on the beat and fades over a third of a second */
export function tintAt(pulses: [number, string][] | undefined, t: number): { a: number; c: string } {
  let a = 0, c = TINTS[0];
  for (const [p, col] of pulses || []) { if (p > t) break; const k = Math.exp(-(t - p) / 0.22); if (k > a) { a = k; c = col; } }
  return { a: a < 0.02 ? 0 : a, c };
}

/** black and white until the drop: the shots that start before the first drop (none: no drop, or one in the first 2 s) */
export function bwShots(shots: { start: number }[], firstDrop: number | null): number[] {
  if (firstDrop === null || firstDrop < 2) return [];
  return shots.map((s, i) => i).filter((i) => shots[i].start < firstDrop - 0.05);
}
