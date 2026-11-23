/**
 * The Reel as a story, the way an editor lays one out: it opens on a hook (the first two seconds that stop the scroll),
 * sets the scene (wide, steady shots: the place and who is there), builds, reaches its peak on the song's drops (people
 * close up: their faces carry the feeling), and closes (calm when the song settles, strong when it ends on a hit).
 *
 * Only what the phone measures is used (movement, faces and how big they are in the picture, the song's cuts), so it
 * works on every plan and on the phone, with no AI. It only nudges which moment a shot takes: a bonus far smaller than
 * the cost of a dark or blurry moment, so footage quality and the AI's own choices still win.
 *
 * Measured on 17 human-edited Reels (FE/mobile-app/tests/human-rebuild.test.ts, 245 shots): the close and the hook are kept.
 * The hook (2026-11-23): editors open on movement (movement alone ranks their opening at 65%), but the scorer's own
 * movement term is so small beside its faces and sharpness that it placed their openings at 45%; with the hook's bonus
 * 56%. It is small enough that a blurred moment (0.9) is not made an opening by a little more movement.
 * The figures below are from before 2026-11-23, when the test favoured long shots (a blind scorer got 36%, not 50%).
 * A calm last shot matched the editors (their last shot 35% -> 39% placed as they placed it); a wide, steady setup made
 * it worse (37% -> 35%: their opening shots move more) and close-ups at the peak changed nothing, so those two give no
 * bonus. The roles stay: the benchmark reports by them.
 *
 * "In my order" keeps the creator's clips in order. The teaser (open on a stronger moment from later in the clips for
 * about a second, then play from the start) is off: it opens on the moment Shubix's hook score likes best, and that
 * score placed the editors' own opening shots at 31% (worse than a random pick), so it is not trusted to reorder a
 * creator's clips yet. STORY_ON.teaser turns it on.
 */

export type StoryRole = "hook" | "setup" | "build" | "peak" | "close";
export type StorySlot = { kind?: string; start: number; end: number };
export type StoryMoment = {
  /** movement, 0 (still) to 1 (the most movement in these clips) */
  motion: number;
  /** share of the moment with a face in it, 0 to 1 */
  face: number;
  /** the face's width as a share of the picture's width (0 = none) */
  faceSize: number;
  /** what the music does at this shot's cut */
  kind?: string;
};

export const STORY = {
  /** a face this wide (a share of the picture) or wider is a close-up */
  closeFace: 0.25,
  /** the first part of the Reel that sets the scene (a share of its length), and the most shots it needs to have one */
  setupUntil: 0.2, setupMinShots: 5,
  /** where a hit on the song counts as the peak (shares of the Reel's length) */
  peakFrom: 0.6, peakTo: 0.9,
  /** the most a story bonus moves a moment's score (a dark moment costs 1, a blurry one 0.9) */
  most: 0.6,
  /** the hook's liking for movement (times the square root of it: 0.02 and 0.2 differ as much as an eye sees) */
  hookMotion: 2,
  /** the teaser: how long (s), the shot it is cut from (s, at least), and how much stronger it must be than the opening */
  teaserMin: 0.9, teaserMax: 1.9, teaserAim: 1.3, teaserShot: 2.8, teaserRest: 1.4, teaserBetter: 0.6, teaserGap: 0.3,
} as const;

/** what is switched on (the teaser stays off until the hook score matches editors' openings: see the top) */
export const STORY_ON = { teaser: false };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : 0));

/** each shot's part in the story, from the song's cuts and where each shot falls in the Reel */
export function storyRoles(slots: StorySlot[]): StoryRole[] {
  const n = slots.length;
  if (!n) return [];
  const t0 = slots[0].start, T = Math.max(1e-6, slots[n - 1].end - t0);
  const firstDrop = slots.findIndex((s) => s.kind === "drop");
  return slots.map((s, i) => {
    if (i === 0) return "hook";
    if (n >= 4 && i === n - 1) return "close";
    if (s.kind === "drop") return "peak";
    const f = (s.start - t0) / T;
    if (n >= STORY.setupMinShots && f < STORY.setupUntil && (firstDrop < 0 || i < firstDrop) && s.kind !== "hit") return "setup";
    if (s.kind === "hit" && f >= STORY.peakFrom && f <= STORY.peakTo) return "peak";
    return "build";
  });
}

/** how much better (or worse) a moment suits its shot's part in the story (score units, within ±STORY.most; the hook 0..STORY.hookMotion) */
export function storyBonus(role: StoryRole | undefined, m: StoryMoment): number {
  // editors open on movement, and the scorer's own term is too small to say so (see the top)
  if (role === "hook") return STORY.hookMotion * Math.sqrt(clamp(m.motion, 0, 1));
  // setup and peak: measured, no help (see the top); the build is the scorer's own
  if (role !== "close") return 0;
  const face = clamp(m.face, 0, 1), motion = clamp(m.motion, 0, 1);
  // how close the people are: only a face seen for most of the moment counts (a face in one frame is not a close-up)
  const close = face > 0.3 ? clamp(m.faceSize / STORY.closeFace, 0, 1) : 0;
  const calm = m.kind !== "drop" && m.kind !== "hit";   // the song settles: a calm last shot; it ends on a hit: a strong one
  const b = calm ? 0.4 * (1 - motion) + 0.2 * face : 0.3 * face * close + 0.2 * motion;
  return clamp(b, -STORY.most, STORY.most);
}

/** where a teaser cut in the opening shot (start..end) goes: on a beat about a second in (one frame before it, as every
 * cut is), with enough of the opening shot left after it. null: the shot is too short or has no such beat. */
export function teaserCut(start: number, end: number, beats: number[], lead = 1 / 30): number | null {
  if (end - start < STORY.teaserShot) return null;
  let best: number | null = null, bd = Infinity;
  for (const b of beats) {
    const c = b - lead, d = c - start;
    if (d < STORY.teaserMin || d > STORY.teaserMax || end - c < STORY.teaserRest) continue;
    const off = Math.abs(d - STORY.teaserAim);
    if (off < bd) { bd = off; best = c; }
  }
  return best;
}

/** a teaser is worth it only when it is switched on and clearly stronger than the opening the clips' order gives */
export const teaserWorth = (opening: number, teaser: number) => STORY_ON.teaser && Number.isFinite(teaser) && teaser >= opening + STORY.teaserBetter;

/** whether a moment a..b of a clip stays clear of the parts the Reel already shows (with a gap, so it is not seen twice) */
export const teaserFree = (a: number, b: number, shown: [number, number][]) =>
  shown.every(([u0, u1]) => b + STORY.teaserGap <= u0 || a >= u1 + STORY.teaserGap);
