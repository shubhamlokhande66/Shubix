/** Is the reference Reel's music the creator's song, and where in the song does it start?
 *
 * "Copy a Reel" with the same song: the creator gives the Reel (a video, its sound inside) and the song as its own file
 * (an mp3, another length, another encoding). The two are the same recording when their onset curves (where the sound
 * gets louder, frame by frame) line up; the lag where they line up best is where the Reel's first frame is in the song.
 * Then every cut of the Reel can land at its own moment of the song, to the frame, not fitted again to beats.
 *
 * Two passes: a coarse one over every lag (100 frames a second), then a fine one around the best lag (1 ms steps).
 * Measured on the phone; nothing is uploaded. */

export const ALIGN_FPS = 100;

/** How the sound rises, ALIGN_FPS frames a second: the positive change of the log energy, lightly smoothed and with its
 * slow trend taken out (a louder or quieter copy, or another loudness curve on the master, lines up all the same). */
export function onsetCurve(mono: Float32Array, sr: number, fps = ALIGN_FPS): Float32Array {
  const hop = Math.max(1, Math.round(sr / fps)), win = hop * 2, n = Math.max(0, Math.floor((mono.length - win) / hop) + 1);
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const a = f * hop;
    for (let i = a; i < a + win; i++) s += mono[i] * mono[i];
    e[f] = Math.log(1e-7 + s / win);
  }
  const o = new Float32Array(n);
  for (let f = 1; f < n; f++) o[f] = Math.max(0, e[f] - e[f - 1]);
  // smoothing over 3 frames, then the local mean (1 s) taken out
  const sm = new Float32Array(n);
  for (let f = 0; f < n; f++) sm[f] = (o[Math.max(0, f - 1)] + 2 * o[f] + o[Math.min(n - 1, f + 1)]) / 4;
  const pre = new Float64Array(n + 1);
  for (let f = 0; f < n; f++) pre[f + 1] = pre[f] + sm[f];
  const half = fps >> 1, out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const lo = Math.max(0, f - half), hi = Math.min(n, f + half);
    out[f] = sm[f] - (pre[hi] - pre[lo]) / Math.max(1, hi - lo);
  }
  return out;
}

/** Pearson correlation of ref against song from song frame `lag` on (only where both have sound). */
function corrAt(ref: Float32Array, song: Float32Array, lag: number): number {
  const a0 = Math.max(0, -lag), a1 = Math.min(ref.length, song.length - lag);
  const n = a1 - a0;
  if (n < 50) return -1;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = a0; i < a1; i++) { const x = ref[i], y = song[i + lag]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  const vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
  if (vx <= 1e-9 || vy <= 1e-9) return -1;
  return (sxy - sx * sy / n) / Math.sqrt(vx * vy);
}

export type SongAlign = { at: number; score: number; margin: number };

/** Where the reference (its onset curve) starts in the song (its onset curve), in seconds, or null when it is not the same
 * music. `at` may be a little below 0 (the Reel starts a moment before the song file does). At least 60% of the
 * reference (or 6 s) must overlap the song. The best lag must be clearly the best: its correlation at least `minScore`
 * and `minMargin` above the best lag more than half a second away (a loop in the song, the same chorus twice, is then
 * too close to call, and the plain copy is used). */
export function alignInSong(ref: Float32Array, song: Float32Array, fps = ALIGN_FPS, minScore = 0.45, minMargin = 0.12): SongAlign | null {
  if (ref.length < 4 * fps || song.length < 4 * fps) return null;
  const need = Math.min(ref.length, Math.max(6 * fps, Math.round(0.6 * ref.length)));
  const lo = -Math.round(0.5 * fps), hi = song.length - need;
  if (hi < lo) return null;
  const sc = new Float32Array(hi - lo + 1);
  let best = lo, bestS = -2;
  for (let L = lo; L <= hi; L++) { const s = corrAt(ref, song, L); sc[L - lo] = s; if (s > bestS) { bestS = s; best = L; } }
  let second = -1;
  for (let L = lo; L <= hi; L++) if (Math.abs(L - best) > fps / 2 && sc[L - lo] > second) second = sc[L - lo];
  if (bestS < minScore || bestS - second < minMargin) return null;
  // between frames: the peak of a parabola through the best lag and its neighbours
  const y0 = best - 1 >= lo ? sc[best - 1 - lo] : bestS, y2 = best + 1 <= hi ? sc[best + 1 - lo] : bestS, den = y0 - 2 * bestS + y2;
  const frac = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0;
  return { at: (best + frac) / fps, score: bestS, margin: bestS - Math.max(second, 0) };
}

/** The fine pass: the same search on curves made 1000 frames a second, only within ±`range` s of the coarse answer.
 * Gives the offset to about a millisecond (a frame of video is 33 ms). */
export function refineAlign(refMono: Float32Array, refSr: number, songMono: Float32Array, songSr: number, at: number, range = 0.03): number {
  const fps = 1000;
  // only a window of each: 12 s of the reference from its loudest stretch's start is plenty
  const take = 12, refLen = refMono.length / refSr;
  const r0 = Math.max(0, Math.min(refLen - take, 2)), r1 = Math.min(refLen, r0 + take);
  const ref = onsetCurve(refMono.subarray(Math.floor(r0 * refSr), Math.floor(r1 * refSr)), refSr, fps);
  const s0 = Math.max(0, at + r0 - range - 0.05), s1 = Math.min(songMono.length / songSr, at + r1 + range + 0.05);
  if (s1 - s0 < 2) return at;
  const song = onsetCurve(songMono.subarray(Math.floor(s0 * songSr), Math.floor(s1 * songSr)), songSr, fps);
  const centre = Math.round((at + r0 - s0) * fps), R = Math.round(range * fps);
  let best = centre, bestS = -2;
  for (let L = centre - R; L <= centre + R; L++) { const s = corrAt(ref, song, L); if (s > bestS) { bestS = s; best = L; } }
  return bestS > 0.2 ? s0 + best / fps - r0 : at;
}
