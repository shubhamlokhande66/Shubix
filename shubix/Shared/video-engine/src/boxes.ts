/**
 * Photo boxes: over a shot, five tall boxes pop in one after another on the beat (two above, three below), each a
 * picture from the Reel's other clips in a thin white frame; they stay a moment and go together before the cut. Food,
 * cafe and travel Reels do this ("the pizza, then five boxes on it"). Read from a creator's Reel, 2026-11-26.
 *
 * Pure, so both engines make it alike: the website's (components/studio/engine.ts) and the Android app's
 * (engine/brain/core.ts). Each box is an ordinary photo layer; `bump` (its pop-in) and `edge` (its frame) are drawn
 * by both layer renderers (engine.ts drawLayers, StudioLayers.kt).
 */

type Shot = { start: number; end: number; src?: number; beatsIn?: number[] };

/** the five places, as the creator's Reel puts them: middles, 0..1 of the frame */
export const BOX_SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.18, y: 0.25 }, { x: 0.8, y: 0.25 }, { x: 0.18, y: 0.66 }, { x: 0.49, y: 0.77 }, { x: 0.8, y: 0.66 },
];
/** a box's width (share of the frame's width) and its picture's shape on the screen (width / height, in pixels) */
export const BOX_W = 0.24;
export const BOX_ASPECT = 0.38;
/** the pop-in (s) and the frame (share of the frame's width) */
export const BOX_BUMP = 0.2;
export const BOX_EDGE = 0.008;

/** The shots that get boxes: long enough to show them (1.2 s, or 3 beats) and not the hook's first shot (`from` 0: it may,
 * as a copied Reel that has them there); up to `most`, the longest first, never two side by side, in the Reel's order. */
export function boxShots(shots: Shot[], period: number, most = 3, from = 1): number[] {
  const beat = period > 0 ? period : 0.5, len = (i: number) => shots[i].end - shots[i].start;
  const ok = shots.map((_, i) => i).filter((i) => i >= from && len(i) >= Math.max(1.2, 3 * beat)).sort((a, b) => len(b) - len(a) || a - b);
  const out: number[] = [];
  for (const i of ok) { if (out.length >= most) break; if (!out.some((j) => Math.abs(j - i) < 2)) out.push(i); }
  return out.sort((a, b) => a - b);
}

/** When the boxes are on a shot: the first a little before the middle (on a beat when one is near), the others 0.09 s apart
 * (one each beat when the beats are that close); all go together a little before the cut. */
export function boxTimes(s: Shot, period: number, n = BOX_SLOTS.length) {
  const L = s.end - s.start, beats = (s.beatsIn || []).filter((b) => b > 0.35 * L && b < 0.7 * L);
  const first = s.start + (beats.length ? beats[0] : Math.max(0.3, 0.45 * L));
  const step = period > 0 && period < 0.2 ? period : 0.09;
  const t1 = Math.max(first + (n - 1) * step + 0.45, s.end - Math.min(0.25, 0.12 * L));
  return { t0s: Array.from({ length: n }, (_, k) => first + k * step), t1: Math.min(s.end, t1) };
}

/** The pictures for one shot's boxes: other shots of the Reel (their middle), other clips first, never the shot itself;
 * the same shot again only when the Reel has fewer than five others. */
export function boxSources(shots: Shot[], i: number, n = BOX_SLOTS.length): Array<{ shot: number; local: number }> {
  const others = shots.map((_, j) => j).filter((j) => j !== i);
  const ranked = [...others.filter((j) => shots[j].src !== shots[i].src), ...others.filter((j) => shots[j].src === shots[i].src)];
  const pick = ranked.length ? Array.from({ length: n }, (_, k) => ranked[(k + i) % ranked.length]) : [];
  return pick.map((j) => ({ shot: j, local: (shots[j].end - shots[j].start) / 2 }));
}

/** The crop of a picture (w x h) that fills a box: l / t / r / b shares, the middle kept */
export function boxCrop(w: number, h: number, aspect = BOX_ASPECT) {
  const r = w / Math.max(1, h);
  if (r > aspect) { const cut = (1 - aspect / r) / 2; return { l: cut, t: 0, r: cut, b: 0 }; }
  const cut = (1 - r / aspect) / 2; return { l: 0, t: cut, r: 0, b: cut };
}

/** The layers' places and times for one shot (without their pictures): the k-th box's slot, start and look */
export function boxLayers(s: Shot, period: number, n = BOX_SLOTS.length) {
  const slots = boxSlots(n), { t0s, t1 } = boxTimes(s, period, slots.length);
  return slots.map((p, k) => ({ x: p.x, y: p.y, s: BOX_W, t0: t0s[k], t1, fin: 0, fout: 0.08, bump: BOX_BUMP, edge: BOX_EDGE }));
}
/** n of the five places (3 to 5), spread over the frame: three are two above and one below in the middle */
export function boxSlots(n: number) {
  const k = Math.max(3, Math.min(BOX_SLOTS.length, Math.round(n) || BOX_SLOTS.length));
  return (k === 3 ? [0, 1, 3] : k === 4 ? [0, 1, 2, 4] : [0, 1, 2, 3, 4]).map((i) => BOX_SLOTS[i]);
}
/** A copied Reel's photo boxes (refReader `boxes`: when they popped in, how many): on the new Reel's shot showing at that
 * moment, or the nearest shot long enough for them (0.9 s, or 2 beats); as many boxes as it had (3 to 5), one set a shot */
export function boxShotsAt(shots: Shot[], runs: Array<{ t0: number; n?: number }>, period: number, from = 0): Array<{ i: number; n: number }> {
  const beat = period > 0 ? period : 0.5, ok = (j: number) => j >= from && shots[j].end - shots[j].start >= Math.max(0.9, 2 * beat);
  const out: Array<{ i: number; n: number }> = [];
  for (const r of runs) {
    if (!Number.isFinite(r.t0)) continue;
    let i = shots.findIndex((s) => r.t0 < s.end);
    if (i < 0 || !ok(i)) { let bd = Infinity; i = -1; shots.forEach((s, j) => { const d = Math.abs((s.start + s.end) / 2 - r.t0); if (ok(j) && d < bd) { bd = d; i = j; } }); }
    if (i < 0 || out.some((o) => o.i === i)) continue;
    out.push({ i, n: boxSlots(r.n ?? BOX_SLOTS.length).length });
  }
  return out.sort((a, b) => a.i - b.i);
}

/** A layer's pop-in at `t`: its size share (0.55 → a little over 1 → 1, an overshoot as a creator's pop) and opacity */
export function bumpAt(L: { t0: number; bump?: number | null }, t: number): { s: number; a: number } {
  const d = Number(L.bump) || 0; if (d <= 0) return { s: 1, a: 1 };
  const q = Math.max(0, Math.min(1, (t - L.t0) / d)), c = 1.70158, back = 1 + (c + 1) * Math.pow(q - 1, 3) + c * Math.pow(q - 1, 2);
  return { s: 0.55 + 0.45 * back, a: Math.min(1, q * 2.5) };
}
