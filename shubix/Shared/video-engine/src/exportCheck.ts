/**
 * The finished video, read back and checked against the edit that made it. A renderer can fail without an error: a
 * decoder that stalls repeats one picture over the cuts after it, a clip that did not open leaves black where the edit
 * shows footage, a muxer cut short loses the end. Those are the renderer's faults, so making the video again fixes
 * them; what the footage itself has (a night clip, a shot the edit chose dark, a dip to black at a cut, the fade at the
 * end) is never one.
 *
 * The readings are the phone's own clip scan (ClipScan.kt): a sample every 0.1 s or so, with its light `b` (0..1) and
 * its movement `m`, and the scene cuts it saw.
 */

export type ExportSample = { t: number; b: number; m: number };
export type ExportRead = { dur: number; w: number; h: number; samples: ExportSample[]; scenes?: { t0: number; t1: number }[] };
/** what the edit decided, on the Reel's own clock (0 = its first frame) */
export type ExportExpect = { dur: number; cuts: number[]; dark?: [number, number][] };
export type ExportProblem = { code: "unreadable" | "length" | "black" | "frozen"; at?: number; secs?: number; msg: string };
export type ExportVerdict = { ok: boolean; retake: boolean; problems: ExportProblem[] };

/** darker than this is black (the brain's own reading of a dark moment, pure.ts windowStats) */
export const EXPORT_BLACK = 0.08;
/** a picture changed by less than this between samples has not changed at all (a repeated frame) */
export const EXPORT_STILL = 1e-5;

export function checkExportedReel(got: ExportRead, want: ExportExpect): ExportVerdict {
  const problems: ExportProblem[] = [];
  const S = (got.samples || []).filter((s) => Number.isFinite(s.t) && Number.isFinite(s.b)).sort((a, b) => a.t - b.t);
  if (!(got.dur > 0) || !(got.w > 0) || !(got.h > 0) || S.length < 2) {
    problems.push({ code: "unreadable", msg: "The exported video could not be read back." });
    return { ok: false, retake: true, problems };
  }
  if (Math.abs(got.dur - want.dur) > Math.max(0.5, want.dur * 0.03))
    problems.push({ code: "length", secs: +(got.dur - want.dur).toFixed(2), msg: `The video is ${got.dur.toFixed(1)} s long; the edit is ${want.dur.toFixed(1)} s.` });

  // where black belongs: a shot the edit knows is dark, a dip at a cut, the first moment and the end's fade
  const cuts = want.cuts.filter((c) => c > 0 && c < want.dur);
  const allowed = (t: number) => t < 0.3 || t > want.dur - 1 || cuts.some((c) => Math.abs(t - c) <= 0.35) || (want.dark ?? []).some(([a, b]) => t >= a - 0.1 && t <= b + 0.1);
  const runs = (test: (s: ExportSample) => boolean) => {
    const out: [number, number][] = []; let a = -1;
    S.forEach((s, i) => { if (test(s)) { if (a < 0) a = i; } else if (a >= 0) { out.push([S[a].t, S[i - 1].t]); a = -1; } });
    if (a >= 0) out.push([S[a].t, S[S.length - 1].t]);
    return out;
  };
  for (const [a, b] of runs((s) => s.b < EXPORT_BLACK && !allowed(s.t)))
    if (b - a >= 0.4) problems.push({ code: "black", at: +a.toFixed(2), secs: +(b - a).toFixed(2), msg: `Black for ${(b - a).toFixed(1)} s at ${a.toFixed(1)} s where the edit shows footage.` });

  // a picture that does not change across a cut the edit made (and the scan saw no cut there): the decoder stalled
  const seen = (c: number) => (got.scenes ?? []).some((x) => c >= x.t0 - 0.2 && c <= x.t1 + 0.2);
  for (const [a, b] of runs((s) => Number.isFinite(s.m) && s.m < EXPORT_STILL)) {
    const missed = cuts.filter((c) => c > a + 0.15 && c < b - 0.15 && !seen(c));
    if (b - a >= 1 && missed.length) problems.push({ code: "frozen", at: +a.toFixed(2), secs: +(b - a).toFixed(2), msg: `The picture stops for ${(b - a).toFixed(1)} s at ${a.toFixed(1)} s, over ${missed.length} cut${missed.length > 1 ? "s" : ""}.` });
  }
  return { ok: !problems.length, retake: problems.length > 0, problems };
}
