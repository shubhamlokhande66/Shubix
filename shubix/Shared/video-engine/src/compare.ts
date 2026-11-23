/**
 * The Reel's best moments seen side by side by Shubix AI (compare-shots): which to show it, and its answer kept on each
 * clip's frames. `open`: 1 = opens the Reel best; `pos`: where it belongs, 0 = first, 1 = last.
 */
export type ComparedFrame = { t: number; score: number; issues?: string[]; open?: number; pos?: number };
export type CompareClip = { ai?: { frames: ComparedFrame[]; cmp?: string } | null };
export const COMPARE_MAX = 30;

/** the moments to show: each clip's best by the AI's score (one to three a clip, 30 in all), `[clip, frame]`. */
export function compareMoments(clips: CompareClip[], max = COMPARE_MAX): [number, number][] {
  const seen = clips.map((c, i) => ({ i, f: (c.ai?.frames ?? []).map((f, k) => ({ k, s: f.score })).sort((a, b) => b.s - a.s) })).filter((c) => c.f.length);
  if (seen.length < 2) return [];
  const out: [number, number][] = [];
  for (let r = 0; r < 3; r++) for (const c of seen) if (c.f[r] && out.length < max) out.push([c.i, c.f[r].k]);
  return out;
}

/** the answer on the clips' frames; what an older comparison said of these clips goes */
export function applyCompared(clips: CompareClip[], got: { id: string; open: number; pos: number }[]): number {
  let n = 0;
  const cmp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  for (const c of clips) for (const f of c.ai?.frames ?? []) { delete f.open; delete f.pos; }
  for (const c of clips) if (c.ai) c.ai.cmp = cmp;
  for (const g of Array.isArray(got) ? got : []) {
    const [i, k] = String(g?.id).split("_").map(Number), f = clips[i]?.ai?.frames[k];
    if (!f || !Number.isFinite(g.open) || !Number.isFinite(g.pos)) continue;
    f.open = Math.min(1, Math.max(0, g.open)); f.pos = Math.min(1, Math.max(0, g.pos)); n++;
  }
  return n;
}

/** what comparisons with other clips said (kept from earlier Reels) goes, unless all the clips seen were in the same one */
export function keepOneComparison(clips: CompareClip[]): void {
  const seen = clips.filter((c) => c.ai?.frames.length);
  if (new Set(seen.map((c) => c.ai!.cmp ?? "")).size < 2) return;
  for (const c of seen) { delete c.ai!.cmp; for (const f of c.ai!.frames) { delete f.open; delete f.pos; } }
}
