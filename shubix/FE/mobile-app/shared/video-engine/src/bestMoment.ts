/**
 * A clip's best moment, for its card while the clips are added ("Best moment 0:04", agreed with ChatGPT, 2026-11-20).
 * Read from the clip's own scan (no AI, no credits): over 1.5 s windows, the one with the most movement that is sharp
 * and not dark, a face counting for more. Not the first 0.3 s or the last 0.4 s (a camera starting or stopping).
 * null when the clip is too short or the scan says nothing (all still, all dark): the card then says "Ready".
 */
export type MomentSample = { t: number; m?: number; sh?: number; b?: number };
export type MomentFace = { t: number; n?: number };

export function bestMoment(samples: MomentSample[] | null | undefined, dur: number, faces: MomentFace[] = [], win = 1.5): number | null {
  if (!samples || samples.length < 3 || !(dur > win + 0.7)) return null;
  const S = samples.filter((s) => Number.isFinite(s.t)).sort((a, b) => a.t - b.t);
  const shMed = [...S.map((s) => s.sh ?? 1)].sort((a, b) => a - b)[Math.floor(S.length / 2)] || 1;
  let best: number | null = null, bs = 0;
  for (let a = 0.3; a + win <= dur - 0.4 + 1e-6; a += 0.25) {
    const inside = S.filter((s) => s.t >= a && s.t <= a + win); if (!inside.length) continue;
    const m = inside.reduce((x, s) => x + (s.m ?? 0), 0) / inside.length;
    const sh = inside.reduce((x, s) => x + (s.sh ?? 1), 0) / inside.length / shMed;
    const dark = inside.filter((s) => (s.b ?? 0.5) < 0.08).length / inside.length;
    const fIn = faces.filter((f) => f.t >= a && f.t <= a + win), face = fIn.length ? fIn.filter((f) => (f.n ?? 0) > 0).length / fIn.length : 0;
    const sc = m * Math.min(1.3, Math.max(0.3, sh)) * (1 - dark) * (1 + 0.5 * face);
    if (sc > bs * 1.05) { bs = sc; best = a; }
  }
  return best !== null && bs > 0.002 ? Math.round(best * 10) / 10 : null;
}

/** "Best moment 0:04" (whole seconds, as the clip's own clock) */
export function bestMomentWords(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor(t));
  return `Best moment ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
