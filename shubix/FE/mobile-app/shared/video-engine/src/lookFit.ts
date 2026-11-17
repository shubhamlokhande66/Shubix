/**
 * The AI director's look for a shot, checked against the picture. The director plans from words (what each clip is
 * about, the music), so a mask, a green-screen key, curves or HSL it sets can miss what is actually in the frame: a
 * circle mask beside the person, a key on a clip with no green screen (it eats the subject), curves that crush a dark
 * shot, a hue shift that turns skin green. The phone knows the picture (the shot-ranking AI's frames: where the subject
 * is, whether a person, the backdrop; the clip scan: how bright), so each of those settings is fitted to it here before
 * it is put on, like an editor looking at the shot before keeping a preset:
 *   - a mask that shows a shape goes round the subject (moved onto it, made big enough); one that hides a shape never
 *     hides the subject; its keyframes move with it
 *   - a green-screen key stays only on a shot with a green or blue backdrop, in that colour
 *   - curves rise (no tone flips), stay within reach of the shot, never darken a dark shot or brighten a bright one, and
 *     add only a light colour cast
 *   - HSL keeps hue shifts moderate and skin (the red and orange bands) natural on people
 *   - a dark shot is not made darker
 * Unknown picture (no frames looked at): the setting is kept as the director made it.
 */

export type Box = { x: number; y: number; w: number; h: number };
/** what is known of a shot's picture: brightness 0-1, the main subject (top-left box, fractions of the frame), whether
 * it is a person, the backdrop ("none" = looked at, no green or blue screen; undefined = not known) */
export type Picture = { b?: number; subject?: Box | null; person?: boolean; backdrop?: "green" | "blue" | "none"; aspect?: number };
type Look = Record<string, any>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ID = [0, 0.25, 0.5, 0.75, 1];
const CENTRED = ["circle", "rect", "heart", "star"];

/** the hue (degrees) and saturation of a #RRGGBB colour */
export function hueOf(hex: string): { h: number; s: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0 };
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0 };
}
const KEY = { green: { lo: 75, hi: 165, c: "#00b140" }, blue: { lo: 190, hi: 250, c: "#0047bb" } } as const;

/** a shot's picture from what the phone knows: the ranking AI's frames inside the shot (or the nearest one), the faces
 * found, and the scan's brightness */
export function pictureOf(frames: { t: number; subject?: Box | null; person?: boolean; backdrop?: string | null }[] | null | undefined,
  faces: { t: number; n?: number; fx?: number; fy?: number; fs?: number }[] | null | undefined, a: number, b: number, bright?: number, aspect = 16 / 9): Picture {
  const pic: Picture = { aspect }; if (Number.isFinite(bright)) pic.b = bright;
  const F = (frames || []).filter((f) => f && Number.isFinite(f.t));
  if (F.length) {
    const inside = F.filter((f) => f.t >= a - 0.3 && f.t <= b + 0.3), mid = (a + b) / 2;
    const use = inside.length ? inside : [F.reduce((p, q) => (Math.abs(q.t - mid) < Math.abs(p.t - mid) ? q : p))];
    const s = use.find((f) => f.subject && f.subject.w > 0.01) || null;
    if (s && s.subject) { pic.subject = { ...s.subject }; pic.person = !!s.person; }
    // the backdrop is known only from an answer that says it (older answers do not)
    const said = use.filter((f) => f.backdrop !== undefined);
    if (said.length) { const g = said.filter((f) => f.backdrop === "green").length, bl = said.filter((f) => f.backdrop === "blue").length;
      pic.backdrop = g * 2 >= said.length ? "green" : bl * 2 >= said.length ? "blue" : "none"; }
  }
  if (!pic.subject) {
    const on = (faces || []).filter((f) => f.n && f.t >= a && f.t <= b && Number.isFinite(f.fx) && Number.isFinite(f.fy));
    if (on.length) { const fx = on.reduce((q, f) => q + f.fx!, 0) / on.length, fy = on.reduce((q, f) => q + f.fy!, 0) / on.length, fs = clamp(on.reduce((q, f) => q + (f.fs || 0.2), 0) / on.length, 0.08, 0.6);
      const h = fs / aspect * 1.2; pic.subject = { x: clamp(fx - fs / 2, 0, 1), y: clamp(fy - h / 2, 0, 1), w: fs, h }; pic.person = true; }
  }
  return pic;
}

/** the director's look for a shot, fitted to its picture; fixed: what was changed or left out (mask, key, curves, hsl, light) */
export function fitLook(look: Look, pic: Picture): { look: Look; fixed: string[] } {
  const o: Look = JSON.parse(JSON.stringify(look || {})), fixed = new Set<string>(), asp = pic.aspect || 16 / 9;
  // the mask: sized on the frame's width (a circle stays round), so a subject's height is in widths here
  const m = o.mk;
  if (m && CENTRED.includes(m.s) && pic.subject) {
    const S = pic.subject, cx = S.x + S.w / 2, cy = S.y + S.h * (pic.person ? 0.45 : 0.5), sh = S.h * asp;
    if (m.inv) {
      // hides inside the shape: never over the subject
      const hw = (m.w || 0.7) / 2, hh = (m.h || 0.7) / 2 / asp;
      if (Math.abs(cx - m.x) < hw + S.w * 0.25 && Math.abs(cy - m.y) < hh + S.h * 0.25) { delete o.mk; fixed.add("mask"); }
    } else {
      const k = m.s === "rect" ? 1.2 : 1.45, dx = cx - m.x, dy = cy - m.y;
      if (Math.hypot(dx, dy * asp) > 0.06) {
        m.x = r3(clamp(cx, 0, 1)); m.y = r3(clamp(cy, 0, 1)); fixed.add("mask");
        if (Array.isArray(o.kx)) for (const key of o.kx) if (key.mk) {
          if (Number.isFinite(key.mk.x)) key.mk.x = r3(clamp(key.mk.x + dx, 0, 1));
          if (Number.isFinite(key.mk.y)) key.mk.y = r3(clamp(key.mk.y + dy, 0, 1));
        }
      }
      const nw = Math.min(1.5, S.w * k), nh = Math.min(1.5, sh * k);
      const big = (key: Look) => { let ch = false; if ((key.w ?? 0.7) < nw) { key.w = r3(nw); ch = true; } if ((key.h ?? 0.7) < nh) { key.h = r3(nh); ch = true; } return ch; };
      if (big(m)) fixed.add("mask");
      if (Array.isArray(o.kx)) for (const key of o.kx) if (key.mk && (Number.isFinite(key.mk.w) || Number.isFinite(key.mk.h))) {
        if (Number.isFinite(key.mk.w) && key.mk.w < nw) { key.mk.w = r3(nw); fixed.add("mask"); }
        if (Number.isFinite(key.mk.h) && key.mk.h < nh) { key.mk.h = r3(nh); fixed.add("mask"); }
      }
    }
  }
  // the green-screen key: only where the backdrop is a screen, in its colour
  if (o.ck && pic.backdrop) {
    if (pic.backdrop === "none") { delete o.ck; fixed.add("key"); }
    else { const want = KEY[pic.backdrop], hs = hueOf(o.ck.c);
      if (!hs || hs.s < 0.25 || hs.h < want.lo || hs.h > want.hi) { o.ck.c = want.c; fixed.add("key"); } }
  }
  const b = pic.b;
  // curves: rising, near the shot's own tones, not darker on a dark shot nor brighter on a bright one
  if (o.cv && typeof o.cv === "object") {
    for (const ch of Object.keys(o.cv)) {
      const p = o.cv[ch]; if (!Array.isArray(p) || p.length !== 5) continue;
      const reach = ch === "m" ? 0.25 : 0.15, q = p.map((v: number, i: number) => clamp(v, ID[i] - reach, ID[i] + reach));
      for (let i = 1; i < 5; i++) q[i] = Math.max(q[i], q[i - 1]);
      if (ch === "m" && Number.isFinite(b)) {
        if (b! < 0.25) for (let i = 1; i < 4; i++) q[i] = Math.max(q[i], ID[i]);
        if (b! > 0.75) for (let i = 1; i < 4; i++) q[i] = Math.min(q[i], ID[i]);
        for (let i = 1; i < 5; i++) q[i] = Math.max(q[i], q[i - 1]);
      }
      const r = q.map(r3); if (r.some((v: number, i: number) => Math.abs(v - p[i]) > 1e-3)) fixed.add("curves");
      if (r.every((v: number, i: number) => Math.abs(v - ID[i]) < 1e-3)) delete o.cv[ch]; else o.cv[ch] = r;
    }
    if (!Object.keys(o.cv).length) delete o.cv;
  }
  // HSL: moderate hue shifts; on people the skin bands (red, orange) keep their colour and are not greyed or blown out
  if (o.hsl && typeof o.hsl === "object") {
    for (const band of Object.keys(o.hsl)) {
      const v = o.hsl[band]; if (!Array.isArray(v) || v.length !== 3) continue;
      const skin = pic.person && (band === "red" || band === "orange");
      const w = [clamp(v[0], skin ? -0.05 : -0.3, skin ? 0.05 : 0.3), clamp(v[1], skin ? -0.4 : -1, skin ? 0.5 : 1), clamp(v[2], skin ? -0.2 : -1, skin ? 0.2 : 1)].map(r3);
      if (w.some((x, i) => Math.abs(x - v[i]) > 1e-3)) fixed.add("hsl");
      if (w.every((x) => x === 0)) delete o.hsl[band]; else o.hsl[band] = w;
    }
    if (!Object.keys(o.hsl).length) delete o.hsl;
  }
  // a dark shot is not made darker
  if (Number.isFinite(b) && b! < 0.2 && Number(o.bri) < 0) { delete o.bri; fixed.add("light"); }
  return { look: o, fixed: [...fixed] };
}

/** a shot's picture in words for the director: its light, its subject box and a green or blue backdrop */
export function pictureWords(pic: Picture): { light?: "dark" | "normal" | "bright"; subject?: Box; backdrop?: "green" | "blue" } {
  const o: { light?: "dark" | "normal" | "bright"; subject?: Box; backdrop?: "green" | "blue" } = {};
  if (Number.isFinite(pic.b)) o.light = pic.b! < 0.25 ? "dark" : pic.b! > 0.75 ? "bright" : "normal";
  if (pic.subject) o.subject = { x: +pic.subject.x.toFixed(2), y: +pic.subject.y.toFixed(2), w: +pic.subject.w.toFixed(2), h: +pic.subject.h.toFixed(2) };
  if (pic.backdrop === "green" || pic.backdrop === "blue") o.backdrop = pic.backdrop;
  return o;
}
