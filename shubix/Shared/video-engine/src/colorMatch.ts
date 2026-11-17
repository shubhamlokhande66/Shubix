/**
 * Colour match: clips from different phones, rooms and hours look different side by side (one warm, one blue, one
 * flat). An editor evens them out before the grade so the Reel reads as one piece. Here each shot is pulled part of the
 * way to the Reel's own middle look (the screen-time weighted median of its shots): its light, contrast, colour and
 * warmth, through the shot's own Adjust values (cs.bri, cs.con, cs.sat, cs.warm) that both renderers already draw.
 *
 * Never forced: a small difference is left alone, a correction is at most a gentle one, a dark shot (night) is never
 * brightened and a black-and-white one never coloured, and a shot the creator adjusted is theirs.
 */

/** a frame's colour from its small RGBA (the clip scan's 48 x 27): saturation, red minus blue and the spread of its
 * light, all 0..1. The phone's ClipStats.kt reads the same three numbers. */
export function frameTone(d: ArrayLike<number>, n: number): { sat: number; warm: number; sd: number } {
  let b = 0, b2 = 0, sat = 0, warm = 0;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, bl = d[i * 4 + 2] / 255;
    const y = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; b += y; b2 += y * y;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx > 0.04) sat += (mx - mn) / mx; warm += r - bl;
  }
  return { sat: sat / n, warm: warm / n, sd: Math.sqrt(Math.max(0, b2 / n - (b / n) * (b / n))) };
}

/** a shot's look: the mean of its clip's samples over the moment it shows; `secs` its time on screen */
export type ShotTone = { b: number; sd: number; sat: number; warm: number; secs: number };
export type ToneFix = { bri: number; con: number; sat: number; warm: number };

/** the mean look of a clip's samples between a and b (seconds of the clip); null when they carry no colour (a scan
 * made before the colour was read) */
export function toneOf(samples: { t: number; b: number; sat?: number; warm?: number; sd?: number }[], a: number, b: number): Omit<ShotTone, "secs"> | null {
  const S = samples.filter((s) => s.t >= a - 0.05 && s.t <= b + 0.05 && typeof s.sat === "number" && typeof s.sd === "number" && typeof s.warm === "number");
  if (!S.length) return null;
  const mean = (f: (s: (typeof S)[number]) => number) => S.reduce((t, s) => t + f(s), 0) / S.length;
  return { b: mean((s) => s.b), sd: mean((s) => s.sd!), sat: mean((s) => s.sat!), warm: mean((s) => s.warm!) };
}

const DARK = 0.12, MONO = 0.03, STRENGTH = 0.6;
const clamp = (x: number, a: number) => Math.max(-a, Math.min(a, x));
/** the screen-time weighted median */
function wmedian(v: { x: number; w: number }[]) {
  const s = [...v].sort((p, q) => p.x - q.x), half = s.reduce((t, p) => t + p.w, 0) / 2; let acc = 0;
  for (const p of s) { acc += p.w; if (acc >= half) return p.x; }
  return s.length ? s[s.length - 1].x : 0;
}

/** each shot's Adjust to bring it toward the Reel's middle look; null: leave the shot as it is */
export function matchTones(shots: (ShotTone | null)[]): (ToneFix | null)[] {
  const use = shots.map((s) => !!s && s.secs > 0 && s.b >= DARK && s.sat >= MONO);
  const pool = shots.filter((s, i) => use[i]) as ShotTone[];
  if (pool.length < 2) return shots.map(() => null);
  const T = { b: wmedian(pool.map((s) => ({ x: s.b, w: s.secs }))), sd: wmedian(pool.map((s) => ({ x: s.sd, w: s.secs }))),
    sat: wmedian(pool.map((s) => ({ x: s.sat, w: s.secs }))), warm: wmedian(pool.map((s) => ({ x: s.warm, w: s.secs }))) };
  return shots.map((s, i) => {
    if (!s || !use[i]) return null;
    // a ratio off by less than 8% (or warmth by less than 0.012) is left: nobody sees it
    const part = (want: number, have: number) => { const r = want / Math.max(1e-3, have); return Math.abs(r - 1) < 0.08 ? 0 : (r - 1) * STRENGTH; };
    const bri = clamp(Math.max(part(T.b, s.b), s.b < 0.2 ? 0 : -1) / 0.5, 0.3);   // brightness(1 + bri*0.5): at most 15%
    const fix = { bri: +bri.toFixed(3), con: +clamp(part(T.sd, s.sd), 0.2).toFixed(3), sat: +clamp(part(T.sat, s.sat), 0.3).toFixed(3),
      warm: +(Math.abs(T.warm - s.warm) < 0.012 ? 0 : clamp((T.warm - s.warm) * STRENGTH / 0.08, 0.4)).toFixed(3) };
    return fix.bri || fix.con || fix.sat || fix.warm ? fix : null;
  });
}
