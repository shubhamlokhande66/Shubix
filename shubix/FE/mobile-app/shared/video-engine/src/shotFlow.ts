/**
 * Shot flow: an editor puts next to each other shots that look alike. Measured on 17 human-edited Reels (194 cuts,
 * FE/mobile-app/tests/human-rebuild.test.ts): the editor's next shot is closer to the shot before it than the other
 * shots left are, in movement, warmth (red against blue) and light. With only those three (what the phone reads of every
 * frame), the editor's own next shot ranks at 64% among the shots left (50% = a random pick), above 50% in 16 of the 17
 * Reels. Close-ups after wide shots (the face growing from shot to shot) was also tried: 50%, so it is not used.
 *
 * Shots of one clip look alike as well, and two parts of one clip in a row are still not made (the engines skip a
 * neighbour's clip first); among the other clips, the one that flows on from its neighbours is taken more often. It is a
 * nudge, smaller than the cost of a dark or a blurry moment: footage quality, the song's drops and Shubix AI still win.
 */

/** what the flow compares of a moment: movement (0..1 of the clips' busiest), mean light and warmth */
export type FlowLook = { m: number; b: number; warm?: number };

/** how strongly a shot is drawn to the look of its neighbours (FLOW.weight: the scorer's points for a gap of 1) */
export const FLOW = { weight: 0.5, warm: 4, light: 3 } as const;

/** how far apart two shots look: 0 = alike; about 0.2 for shots of one scene, 1 and more for a cut to another world */
export function flowGap(a: FlowLook, b: FlowLook): number {
  const warm = typeof a.warm === "number" && typeof b.warm === "number" ? Math.abs(a.warm - b.warm) : 0;
  return Math.abs(a.m - b.m) + FLOW.warm * warm + FLOW.light * Math.abs(a.b - b.b);
}

/** the scorer's points for a moment against the shots already beside it (none placed yet: 0) */
export function flowBonus(look: FlowLook, near: readonly (FlowLook | null | undefined)[]): number {
  const N = near.filter((x): x is FlowLook => !!x);
  return N.length ? -FLOW.weight * N.reduce((t, x) => t + flowGap(look, x), 0) / N.length : 0;
}
