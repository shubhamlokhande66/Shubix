/**
 * Which part of a clip is footage (agreed with ChatGPT and Gemini, 2026-11-23). A phone clip often begins before its
 * moment (the phone being put down) and ends after it (the dance is over: people laugh, walk off, reach to stop the
 * camera). An editor leaves that out before choosing moments. Everything is against the clip itself, never a fixed
 * percentage: a move can begin on the first picture. Only the first and last part of a clip can be left out, a clean
 * clip keeps all of it, and a short clip is left as it is.
 */
export type UseSample = { t: number; m: number; sh?: number };
export type UseClip = {
  dur?: number; samples?: readonly UseSample[] | null; reacts?: readonly { t0: number; t1: number }[] | null;
  ai?: { frames?: readonly { t: number; score: number }[] } | null;
};
export type ClipUse = { from: number; to: number; why: string[] };

/** minDur: a shorter clip is left whole. part: at most this much of the clip at either end; keep / keepShare: at least
 *  this much stays. lull: movement under this share of the clip's usual. pose: what is kept after the action. */
export const USE = {
  minDur: 5, part: 0.4, keep: 3, keepShare: 0.5, active: 0.01, lull: 0.35, laughLull: 0.65, lullMin: 1.4, pose: 0.6,
  spike: 2.2, soft: 0.65, handle: 1.5, aiBad: 0.3, aiGood: 0.55,
} as const;

const med = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** where a clip's footage ends (dur when all of it is footage), and why */
function tailEnd(S: UseSample[], dur: number, reacts: readonly { t0: number; t1: number }[], ai: readonly { t: number; score: number }[]): [number, string] {
  const body = S.filter((s) => s.t >= dur * 0.15 && s.t <= dur * 0.75), bm = med(body.map((s) => s.m)), bs = med(body.map((s) => s.sh ?? 0));
  const first = dur * (1 - USE.part);
  // the movement about a moment (half a second)
  const sm = S.map((s) => { const w = S.filter((x) => Math.abs(x.t - s.t) <= 0.25); return w.reduce((q, x) => q + x.m, 0) / w.length; });
  let end = dur, why = "";
  const cut = (t: number, w: string) => { if (t < end) { end = t; why = w; } };
  // reaching to stop the camera: in the last moments the picture jumps about and goes soft, up to the end
  if (bm > 0 && bs > 0) {
    let k = S.length;
    while (k > 0 && S[k - 1].t >= dur - USE.handle && sm[k - 1] >= USE.spike * bm) k--;
    const run = S.slice(k);
    if (run.length >= 3 && med(run.map((s) => s.sh ?? 0)) <= USE.soft * bs) cut(run[0].t, "the camera being handled");
  }
  // the action is over: from here to the end (the handling apart) the clip hardly moves as it did
  if (bm >= USE.active) {
    const stop = end;
    const over = (share: number) => {
      let k = S.length;
      while (k > 0 && S[k - 1].t >= stop - 0.3 && stop < dur) k--;
      const z = k;
      while (k > 0 && sm[k - 1] < share * bm) k--;
      return k < z ? S[k].t : dur;
    };
    const t = over(USE.lull);
    if (dur - t >= USE.lullMin + USE.pose) cut(t + USE.pose, "after the action");
    // people laugh or talk once it is over (a laugh while the action goes on, or a cheer at its peak, is wanted)
    const l = over(USE.laughLull);
    for (const r of reacts) if (r.t0 >= first && l < dur && l <= r.t0 + 0.8) cut(Math.max(l, r.t0 - 0.2), "laughing after it");
  }
  // Shubix AI looked: the clip's last looks are ones an editor would not use, the ones before them are good
  if (ai.length >= 3) {
    const F = ai.slice().sort((a, b) => a.t - b.t);
    let k = F.length;
    while (k > 1 && F[k - 1].score <= USE.aiBad) k--;
    if (k < F.length && F[k - 1].score >= USE.aiGood) cut(Math.max((F[k - 1].t + F[k].t) / 2, first), "Shubix AI would not use it");
  }
  return end >= first - 1e-6 ? [end, why] : [dur, ""]; // (more than its last part: that is what the clip is)
}

/** the part of a clip that is footage */
export function clipUse(c: UseClip): ClipUse {
  const dur = c.dur || 0, all: ClipUse = { from: 0, to: dur, why: [] }, S = (c.samples || []) as UseSample[];
  if (dur < USE.minDur || S.length < 20) return all;
  const R = c.reacts || [], F = (c.ai && c.ai.frames) || [];
  const [to, w1] = tailEnd(S, dur, R, F);
  // the start is the same read backwards (no laugh there: it is before the action)
  const [h, w0] = tailEnd(S.map((s) => ({ ...s, t: dur - s.t })).reverse(), dur, [], F.map((f) => ({ t: dur - f.t, score: f.score })));
  const least = Math.max(USE.keep, dur * USE.keepShare);
  let from = dur - h;
  if (to - from < least) from = 0;
  if (to - from < least) return all;
  return { from, to, why: [from > 0 ? "start: " + w0 : "", to < dur ? "end: " + w1 : ""].filter(Boolean) };
}

/**
 * Where a clip stops moving for good: a last picture repeated to the end (a trimmed phone clip, or its smooth copy up to
 * the end of the sound) is no footage. 0.1 to 1.5 s of it, after a clip that moves; otherwise the clip's own end.
 */
export function stillEnd(samples: readonly UseSample[] | null | undefined, dur: number): number {
  const S = samples || [], n = S.length;
  if (n < 8) return dur;
  let k = n;
  while (k > 1 && S[k - 1].m < 0.0007) k--;
  if (k === n) return dur;
  // (the samples' movement is smoothed over three: the first still one is one sample late)
  const step = (S[n - 1].t - S[0].t) / (n - 1), end = S[k - 1].t + step, before = med(S.slice(Math.max(0, k - 10), k).map((s) => s.m));
  return end > 0.5 && dur - end >= 0.1 && dur - end <= 1.5 && before > 0.0028 ? end : dur;
}

/** how much of the moment [a, b] is not footage (0 to 1) */
export function wasteShare(u: ClipUse, a: number, b: number): number {
  if (!(b > a)) return 0;
  return Math.max(0, Math.min(1, 1 - Math.max(0, Math.min(b, u.to) - Math.max(a, u.from)) / (b - a)));
}

type Slot = { start: number; end: number; type?: string; sp: { pos: (l: number) => number } };
type Got = { src: number; in: number; scaleR: number; ov?: number; byDir?: boolean };
/**
 * A moment is never shown twice while the Reel can do without: a shot that shows footage again is let go and the shot
 * before it (or after it) runs on over its time, when that clip has unused footage there. The plan and its shots are
 * changed in place; how many were let go comes back. A drop's shot stays.
 */
export function absorbRepeats(plan: Slot[], res: Got[], normal: unknown, o: { end: (src: number) => number; from: (src: number) => number; crosses: (src: number, a: number, b: number) => boolean }): number {
  const span = (i: number) => { const p = plan[i], r = res[i]; return [r.in, r.in + p.sp.pos(p.end - p.start) * r.scaleR]; };
  const shared = (k: number, a: number, b: number) => { const [c, d] = span(k); return Math.min(b, d) - Math.max(a, c); };
  const over = (i: number) => { const [a, b] = span(i); let t = 0; res.forEach((r, k) => { if (k !== i && r.src === res[i].src) t = Math.max(t, shared(k, a, b)); }); return t; };
  const free = (src: number, a: number, b: number, skip: number[]) => a >= o.from(src) - 1e-6 && b <= o.end(src) + 1e-6 && !o.crosses(src, a, b) &&
    res.every((r, k) => skip.includes(k) || r.src !== src || shared(k, a, b) <= 0.001);
  let n = 0;
  for (let i = plan.length - 1; i > 0; i--) {
    if (plan[i].type === "drop" || res[i].byDir || over(i) < 0.15) continue;
    const L = plan[i].end - plan[i].start, p = i - 1, q = i + 1;
    if (plan[p].sp === normal) {
      const [a, b] = span(p);
      if (free(res[p].src, a, b + L * res[p].scaleR, [p, i])) { plan[p] = { ...plan[p], end: plan[i].end }; plan.splice(i, 1); res.splice(i, 1); n++; continue; }
    }
    if (q < plan.length && plan[q].sp === normal && plan[q].type !== "drop" && !res[q].byDir) {
      const [a, b] = span(q), s = a - L * res[q].scaleR;
      if (free(res[q].src, s, b, [q, i])) { res[q] = { ...res[q], in: s }; plan[q] = { ...plan[q], start: plan[i].start }; plan.splice(i, 1); res.splice(i, 1); n++; }
    }
  }
  if (n) res.forEach((r, i) => { if (over(i) < 0.15) r.ov = 0; });
  return n;
}
