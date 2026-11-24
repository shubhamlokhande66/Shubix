/**
 * A Reel saved from Instagram ends on a card Instagram adds: about 4 s of the last picture darkened with the Instagram
 * logo and the @handle, under Instagram's own sound (0.4 s of silence, 1.3 s of sound, silence). It is not the editor's
 * ending: read as part of the Reel it is a 4 s last shot, a black end, a drop in the music, and a name that is not the
 * creator's. Its sound is the same in every file, so the sound finds it.
 *
 * Measured on 63 saved Reels (2026-11-24): the sound's loudness matches this shape at 0.94 to 1.00 in all 63, and starts
 * 3.58 to 3.68 s before the end.
 */

/** the card's sound: its loudness every 20 ms, for 1.2 s */
const SHAPE = [0.558, 1.025, 0.899, 0.996, 0.989, 0.835, 1.002, 0.808, 0.466, 0.166, 0.226, 0.198, 0.318, 0.455, 0.459, 0.498, 0.364, 0.611, 0.699, 0.621, 0.441, 0.633, 0.632, 0.657, 0.401, 0.344, 0.607, 0.693, 0.475, 0.283, 0.445, 0.679, 0.616, 0.517, 0.202, 0.306, 0.334, 0.31, 0.152, 0.066, 0.06, 0.065, 0.092, 0.054, 0.035, 0.019, 0.025, 0.04, 0.05, 0.051, 0.028, 0.014, 0.028, 0.034, 0.024, 0.014, 0.013, 0.015, 0.015, 0.007];
const HOP = 0.02, QUIET = 0.01;
/** the card's picture starts this long before its sound */
const PICTURE = 0.42;

function alike(a: number[], b: number[]): number {
  const mean = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length, ma = mean(a), mb = mean(b);
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < a.length; i++) { xy += (a[i] - ma) * (b[i] - mb); xx += (a[i] - ma) ** 2; yy += (b[i] - mb) ** 2; }
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
}

/** where the Reel itself ends when Instagram's card follows it (s); null = no card */
export function instaCardStart(mono: ArrayLike<number>, sr: number): number | null {
  if (!(sr > 0) || mono.length < 6 * sr) return null;
  const hop = Math.round(HOP * sr), back = Math.round(5 / HOP), n = Math.floor(mono.length / hop), from = Math.max(0, n - back), e: number[] = [];
  for (let k = from; k < n; k++) { let s = 0; for (let i = k * hop; i < (k + 1) * hop; i++) s += mono[i] * mono[i]; e.push(Math.sqrt(s / hop)); }
  const N = SHAPE.length, at = (k: number) => (from + k) * hop / sr, dur = mono.length / sr;
  let best = 0, where = -1;
  for (let k = 0; k + N <= e.length; k++) { const left = dur - at(k); if (left < 3.2 || left > 4.2) continue; const c = alike(e.slice(k, k + N), SHAPE); if (c > best) { best = c; where = k; } }
  if (where < 0 || best < 0.9) return null;
  // silence before the sound and after it, as in every card: music that happens to have the shape has neither
  const quiet = (a: number, b: number) => { const x = e.slice(Math.max(0, a), b); return x.length > 0 && x.every((v) => v < QUIET); };
  if (!quiet(where - 17, where - 2) || !quiet(where + 90, e.length)) return null;
  return Math.max(0, at(where) - PICTURE);
}
