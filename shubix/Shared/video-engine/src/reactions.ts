/**
 * Reactions in a clip's own sound: cheers, laughs, clapping, a shout. An editor keeps the moment people react to (the
 * cake cut, the goal, the bride's entry), so a moment of a clip whose sound suddenly gets loud is worth more. Found on the
 * phone from the clip's sound alone, no AI: the clip's loudness every 50 ms against its own usual loudness. A part far
 * louder than usual (REACT.rise times the median, at least REACT.floor), 0.3 s to 8 s long, that rises out of a quieter
 * part, is a reaction. A clip loud all through (music playing, traffic) has none: nothing stands out in it.
 *
 * The Reel's sound is the song, so the reaction is not heard; it only tells which moment of the footage people cared
 * about. The bonus is about that of a face in the picture, smaller than a dark or blurry moment costs. It counts the
 * moment just before the reaction too (what people reacted to). Not yet measured against human editors: the human Reels
 * of the rebuild test carry only their song. The real test (raw clips with their sound, and the editor's Reel) measures it.
 */

export type Reaction = { t0: number; t1: number; s: number };

export const REACT = { hop: 0.05, rise: 2.2, floor: 0.02, silent: 0.003, minLen: 0.3, maxLen: 8, loudShare: 0.35, before: 0.4, after: 0.5, weight: 0.35 } as const;

/** the reactions in a clip's sound: mono samples `x` at `sr` Hz */
export function reactionsOf(x: ArrayLike<number>, sr: number): Reaction[] {
  const hop = Math.max(1, Math.round(sr * REACT.hop)), n = Math.floor(x.length / hop);
  if (n < 10) return [];
  const rms = new Float32Array(n);
  for (let k = 0; k < n; k++) { let q = 0; for (let i = k * hop; i < (k + 1) * hop; i++) q += x[i] * x[i]; rms[k] = Math.sqrt(q / hop); }
  const heard = Array.from(rms).filter((v) => v >= REACT.silent).sort((a, b) => a - b);
  if (heard.length < n * 0.3) return [];   // (mostly silent: no sound to read)
  const med = heard[heard.length >> 1], loud = Math.max(REACT.rise * med, REACT.floor);
  // the loud frames, in runs (a frame's dip inside a cheer does not end it)
  const runs: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    if (rms[k] < loud) continue;
    const last = runs[runs.length - 1];
    if (last && k - last[1] <= 2) last[1] = k; else runs.push([k, k]);
  }
  const loudTime = runs.reduce((t, [a, b]) => t + b - a + 1, 0) * REACT.hop;
  if (loudTime > REACT.loudShare * n * REACT.hop) return [];   // loud all through: nothing stands out
  const out: Reaction[] = [];
  for (const [a, b] of runs) {
    const len = (b - a + 1) * REACT.hop;
    if (len < REACT.minLen || len > REACT.maxLen) continue;
    // it rises out of a quieter part (the half second before it is quieter than the reaction)
    let pre = 0, pn = 0; for (let k = Math.max(0, a - 10); k < a; k++) { pre += rms[k]; pn++; }
    let mid = 0; let peak = 0; for (let k = a; k <= b; k++) { mid += rms[k]; peak = Math.max(peak, rms[k]); }
    mid /= b - a + 1;
    if (pn && pre / pn > 0.7 * mid) continue;
    out.push({ t0: a * REACT.hop, t1: (b + 1) * REACT.hop, s: Math.max(0, Math.min(1, Math.log2(peak / Math.max(1e-6, med)) / 3)) });
  }
  return out;
}

/** the scorer's points for a moment [a, b] of a clip with these reactions: the strongest it shows (or what led to it) */
export function reactionBonus(R: readonly Reaction[] | null | undefined, a: number, b: number): number {
  if (!R || !R.length || !(b > a)) return 0;
  let best = 0;
  for (const r of R) {
    const from = r.t0 - REACT.before, to = r.t1 + REACT.after, ov = Math.min(b, to) - Math.max(a, from);
    if (ov <= 0) continue;
    best = Math.max(best, r.s * Math.min(1, ov / Math.min(b - a, to - from)));
  }
  return REACT.weight * best;
}
