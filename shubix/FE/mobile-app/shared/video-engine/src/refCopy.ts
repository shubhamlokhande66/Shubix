/**
 * "Copy a Reel": what the reader knows only by its look and the studio has under its own name. Before 2026-11-24 these
 * were read and only written to the learning log; now the copied shot gets them.
 */
/** transitions: a push to a side, a zoom out, a light leak / film burn */
export const REF_TRX = ["slideleft", "slideright", "zoomout", "burn", "flashblur", "stretch", "zoomblur", "doors", "wave", "panels", "hpanels", "vpanels"];
/** effects inside a shot: RGB split, mirror, strobe */
export const REF_FX = ["rgbpulse", "mirror", "strobe", "leak"];

/** the studio's transition for a shot of the copied Reel: the one seen by its look when the plan has it, else its kind's */
export function refTrOf(m: { tr?: string; trx?: string }, kinds: Record<string, string>, may: (k: string) => boolean): string {
  if (m.tr === "start") return "hard";
  if (m.trx && REF_TRX.includes(m.trx) && may(m.trx)) return m.trx;
  return kinds[m.tr ?? ""] || "hard";
}

/** a copied camera move (scale, sideways and up/down as parts of the frame, degrees), kept over the whole frame: a move that
 * would uncover an edge (a zoom out under full size, a slide, a turn) is enlarged, and made smaller when that needs over 1.6x */
/** A shot of the Reel copied held tilted (refReader tiltOf): its camera keys turned by that angle after coverMove, so
 * the corners show as in the Reel; with no move, the turn alone over the shot */
export function tiltMove<K extends { t: number; s: number; x: number; y: number; r: number }>(keys: K[], tilt: number, len: number, make: (t: number) => K): K[] {
  const d = Math.max(-45, Math.min(45, tilt));
  if (!Number.isFinite(d) || Math.abs(d) < 1) return keys;
  return keys.length ? keys.map((k) => ({ ...k, r: k.r + d })) : [make(0), make(len)].map((k) => ({ ...k, r: d }));
}
export function coverMove<K extends { s: number; x: number; y: number; r: number }>(keys: K[]): K[] {
  const need = (k: { x: number; y: number; r: number }) => { const a = (Math.abs(k.r) * Math.PI) / 180; return (Math.cos(a) + Math.sin(a) * 1.78) * (1 + 2 * Math.max(Math.abs(k.x), Math.abs(k.y))); };
  for (let m = 1; ; m -= 0.1) {
    const v = keys.map((k) => ({ ...k, s: 1 + (k.s - 1) * m, x: k.x * m, y: k.y * m, r: k.r * m }));
    const f = Math.max(1, ...v.map((k) => need(k) / k.s));
    if (f <= 1.6 || m <= 0.1) return v.map((k) => ({ ...k, s: +Math.min(2.5, k.s * f).toFixed(4), x: +k.x.toFixed(4), y: +k.y.toFixed(4), r: +k.r.toFixed(3) }));
  }
}

/** one flash reads as two jumps (into white, out of it): two flashes within 0.25 s are one cut, at the first; a run of them
 * joins for at most 0.4 s. In time order; changes the list. */
export function joinFlashes<C extends { t: number; kind?: string; odd?: unknown }>(cuts: C[]): C[] {
  for (let i = 0; i < cuts.length; i++) {
    if (cuts[i].kind !== "flash") continue;
    let last = cuts[i].t;
    while (i + 1 < cuts.length && cuts[i + 1].kind === "flash" && cuts[i + 1].t - last < 0.25 && cuts[i + 1].t - cuts[i].t <= 0.4) { last = cuts[i + 1].t; if (cuts[i + 1].odd) cuts[i].odd = cuts[i + 1].odd; cuts.splice(i + 1, 1); }
  }
  return cuts;
}
/** how sharp a small grey frame is */
export function sharpOfY(Y: ArrayLike<number>, W: number): number {
  let s = 0, n = 0;
  for (let q = 0; q + W + 1 < Y.length; q += 2) { s += Math.abs(Y[q + 1] - Y[q]) + Math.abs(Y[q + W] - Y[q]); n++; }
  return n ? s / n : 0;
}
/** where a Reel goes soft from one shot into another (every frame's sharpness; how different the pictures 8 frames before and after are) */
export function blurCuts(sharp: ArrayLike<number>, far: ArrayLike<number>, fps: number): number[] {
  const out: number[] = [];
  for (let i = 8; i + 8 < sharp.length; i++) {
    const side = Math.min(sharp[i - 8], sharp[i + 8]);
    if (side < 0.015 || sharp[i] >= 0.5 * side || far[i] < 0.1) continue;
    let low = true; for (let j = i - 6; j <= i + 6; j++) if (sharp[j] < sharp[i] || (j < i && sharp[j] === sharp[i])) low = false;
    if (low && (!out.length || i / fps - out[out.length - 1] > 0.4)) out.push(i / fps);
  }
  return out;
}
/** how warm a picture's light is (RGBA): red over blue, 0-1 */
export function warmOf(d: ArrayLike<number>): number {
  let s = 0, n = 0;
  for (let i = 0; i + 3 < d.length; i += 12) { s += d[i] - d[i + 2]; n++; }
  return n ? s / n / 255 : 0;
}
/** Panels: pieces of the frame that change to another picture one after another and stay (a build out of black, rows,
 * columns). cells(i): frame i as gx x gy grey cells (0-1), every frame at fps. A piece: a box that differs before and
 * after it, steady on both sides, while most of the rest stays. Three or more pieces in new places, each within 1.2 s of
 * the last, are one build; its kind from the pieces' shape (rows, columns) and from black (a build out of black). */
export function panelRuns(cells: (i: number) => ArrayLike<number>, N: number, gx: number, gy: number, fps = 30): { t0: number; t1: number; kind: string; n: number; area: number }[] {
  const C = gx * gy, ev: { i: number; bx: number[]; dark: boolean }[] = [];
  for (let i = 7; i < N - 7; i++) {
    const P = cells(i - 4), Q = cells(i + 4), P0 = cells(i - 7), Q1 = cells(i + 7), ch = new Uint8Array(C);
    let k = 0, rest = 0, rc = 0, dark = 0;
    for (let c = 0; c < C; c++) if (Math.abs(P[c] - Q[c]) > 0.1 && Math.abs(P0[c] - P[c]) < 0.05 && Math.abs(Q[c] - Q1[c]) < 0.05) { ch[c] = 1; k++; if (P[c] < 0.06) dark++; }
    if (k < 0.04 * C || k > 0.6 * C) continue;
    for (let c = 0; c < C; c++) if (!ch[c]) { rc++; if (Math.abs(P[c] - Q[c]) < 0.05) rest++; }
    if (rest < 0.7 * rc) continue;
    // the biggest piece of joined cells, and how well it fills its box
    const lab = new Uint8Array(C); let best: number[] = [];
    for (let c0 = 0; c0 < C; c0++) {
      if (!ch[c0] || lab[c0]) continue;
      const st = [c0], cc: number[] = []; lab[c0] = 1;
      while (st.length) {
        const c = st.pop()!; cc.push(c); const x = c % gx, y = (c / gx) | 0;
        for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (a < 0 || b < 0 || a >= gx || b >= gy) continue; const d = b * gx + a; if (ch[d] && !lab[d]) { lab[d] = 1; st.push(d); } }
      }
      if (cc.length > best.length) best = cc;
    }
    if (best.length < 0.04 * C) continue;
    const xs = best.map((c) => c % gx), ys = best.map((c) => (c / gx) | 0), bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (best.length / ((bx[2] - bx[0] + 1) * (bx[3] - bx[1] + 1)) < 0.75) continue;
    ev.push({ i, bx, dark: dark > 0.6 * k });
  }
  const iou = (a: number[], b: number[]) => {
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 1, h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 1; if (w <= 0 || h <= 0) return 0;
    const A = (x: number[]) => (x[2] - x[0] + 1) * (x[3] - x[1] + 1); return (w * h) / Math.min(A(a), A(b));
  };
  type Piece = { i: number; i1: number; bx: number[]; dark: boolean };
  const one: Piece[] = [];
  for (const e of ev) { const l = one.find((x) => e.i - x.i1 < 8 && iou(x.bx, e.bx) > 0.5); if (l) l.i1 = e.i; else one.push({ ...e, i1: e.i }); }
  const runs: Piece[][] = [];
  for (const e of one) { const l = runs[runs.length - 1]; if (l && e.i - l[l.length - 1].i < 1.2 * fps) l.push(e); else runs.push([e]); }
  return runs.map((r) => { const u: Piece[] = []; for (const e of r) if (!u.some((x) => iou(x.bx, e.bx) > 0.3)) u.push(e); return u; })
    .filter((u) => u.length >= 3)
    .map((u) => {
      // the pieces' width and height on the 9:16 frame
      const w = u.reduce((a, e) => a + e.bx[2] - e.bx[0] + 1, 0) / u.length, h = (u.reduce((a, e) => a + e.bx[3] - e.bx[1] + 1, 0) / u.length) * (gx / gy) * 1.78;
      const dark = u.filter((e) => e.dark).length >= u.length / 2;
      // the share of the frame the pieces cover together: a build fills it, boxes over a shot leave most of it
      const cov = new Uint8Array(C); for (const e of u) for (let y = e.bx[1]; y <= e.bx[3]; y++) for (let x = e.bx[0]; x <= e.bx[2]; x++) cov[y * gx + x] = 1;
      const area = +(cov.reduce((a, v) => a + v, 0) / C).toFixed(2);
      // boxes over a shot (pictures pop in and the shot stays behind them: a food Reel's five boxes) cover under half the
      // frame and come out of the picture, not black; a build fills it
      const kind = !dark && area < 0.45 ? "boxes" : dark ? "panels" : w > 1.5 * h ? "hpanels" : h > 1.5 * w ? "vpanels" : "panels";
      return { t0: +(u[0].i / fps).toFixed(2), t1: +(u[u.length - 1].i1 / fps).toFixed(2), kind, n: u.length, area };
    });
}
