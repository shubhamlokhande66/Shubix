/**
 * A Reel from very little video (one 4 s clip).
 *
 * Shubix does not send the person back for more clips: it makes the Reel, and the song decides how. Under a slow
 * song the video plays in slow motion, so 4 s of video become an 8 s Reel; under a fast song it plays as filmed and
 * the Reel is as long as the video; in between, in between. Never slower than half speed (a phone's 30 pictures a
 * second stutter below it). Under 2 s of good video there is nothing to make a Reel of.
 * Both engines ask this before the Reel's length is set (the website's studio and the Android app's create flow).
 */
export const SHORT_REEL = {
  /** less good video than this (seconds): more clips are asked for */
  least: 2,
  /** from this much good video (seconds) on, the Reel is as long as the video, as before */
  enough: 5,
  /** a song at or under this tempo is slow: half speed */
  slowBpm: 95,
  /** a song at or over this tempo is fast: as filmed */
  fastBpm: 130,
  /** the slowest the video plays */
  slowest: 0.5,
  /** the shortest Reel (seconds) */
  shortest: 3,
} as const;

export type ShortReel = {
  /** the Reel's length in seconds (to a tenth) */
  len: number;
  /** how fast the video plays over it: 1 as filmed, 0.5 half speed */
  speed: number;
};

/**
 * The Reel to make of `goodSeconds` of good video under a song whose beats are `beatPeriod` seconds apart
 * (0: no steady beat, taken as slow) and which is `songSeconds` long. null: too little video for any Reel.
 */
export function shortReelFor(goodSeconds: number, beatPeriod: number, songSeconds = Infinity): ShortReel | null {
  const have = Number.isFinite(goodSeconds) ? goodSeconds : 0;
  if (have < SHORT_REEL.least) return null;
  const tenth = (x: number) => Math.round(x * 10) / 10;
  const most = songSeconds > 0 ? songSeconds : Infinity;
  if (have >= SHORT_REEL.enough) { const len = tenth(Math.min(have, most)); return { len, speed: 1 }; }
  const bpm = beatPeriod > 0 && Number.isFinite(beatPeriod) ? 60 / beatPeriod : 0;
  const { slowBpm, fastBpm, slowest, shortest } = SHORT_REEL;
  const want = bpm <= slowBpm ? slowest : bpm >= fastBpm ? 1 : slowest + (1 - slowest) * (bpm - slowBpm) / (fastBpm - slowBpm);
  const len = tenth(Math.min(most, Math.max(shortest, have / want)));
  return { len, speed: Math.min(1, Math.round(have / len * 100) / 100) };
}

/**
 * One clip is one take (both engines' seqPick): it plays as filmed up to the song's moment, in slow motion from there.
 * So its Reel is longer than the clip: the first part as filmed, the rest at half speed.
 */
export const ONE_TAKE = {
  /** where the slow motion begins when the song names no moment (share of the Reel) */
  slowFrom: 0.4,
  /** the speed from there on */
  slow: 0.5,
} as const;

/** How long a Reel one clip with `goodSeconds` of good video makes as one take, under a song of `songSeconds` (whole seconds). */
export function oneTakeLength(goodSeconds: number, songSeconds = Infinity): number {
  const have = Number.isFinite(goodSeconds) && goodSeconds > 0 ? goodSeconds : 0;
  const reel = have / (ONE_TAKE.slowFrom + (1 - ONE_TAKE.slowFrom) * ONE_TAKE.slow);
  return Math.floor(Math.min(songSeconds > 0 ? songSeconds : Infinity, reel));
}
