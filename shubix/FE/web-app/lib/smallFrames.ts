import type { InputVideoTrack, VideoSample } from "mediabunny";

/** A video's frames made small, for reading it (its motion, cuts and faces). The same picture as mediabunny's CanvasSink
 * gives (halved step by step, so nothing is skipped), but each step has a canvas of its own: CanvasSink draws its canvas
 * onto itself, which copies it every time (5 s of a 1080p Reel: 15.3 s there, 2.2 s here, 0.4 of 255 apart). */
export function smallFrames(mb: typeof import("mediabunny"), track: InputVideoTrack, w: number, h: number, pool = 0) {
  const sink = new mb.VideoSampleSink(track), steps: CanvasRenderingContext2D[] = [], outs: CanvasRenderingContext2D[] = [];
  const ctx = (cw: number, ch: number, read: boolean) => {
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d", { willReadFrequently: read })!;   // (plain smoothing: each step is half or less of a halving; "high" makes a frame 3x slower)
    return g;
  };
  let used = 0;
  const draw = (s: VideoSample): HTMLCanvasElement => {
    const turned = s.rotation % 180 !== 0, sw = turned ? s.squarePixelHeight : s.squarePixelWidth, sh = turned ? s.squarePixelWidth : s.squarePixelHeight;
    const levels = halvings(sw, sh, w, h), k = used++ % Math.max(1, pool), out = pool ? (outs[k] ??= ctx(w, h, true)) : ctx(w, h, true);
    if (!levels) { s.drawWithFit(out, { fit: "fill" }); return out.canvas; }
    for (let i = levels; i > 0; i--) steps[i] ??= ctx(w * 2 ** i, h * 2 ** i, false);
    s.drawWithFit(steps[levels], { fit: "fill" });
    for (let i = levels - 1; i >= 0; i--) { const to = i ? steps[i] : out; to.drawImage(steps[i + 1].canvas, 0, 0, w * 2 ** i, h * 2 ** i); }
    return out.canvas;
  };
  return {
    /** every frame of the video once, with its time */
    async all(): Promise<{ t: number; c: HTMLCanvasElement }[]> {
      const list: { t: number; c: HTMLCanvasElement }[] = [];
      for await (const s of sink.samples()) { try { list.push({ t: s.timestamp, c: draw(s) }); } finally { s.close(); } }
      return list.sort((x, y) => x.t - y.t);
    },
    /** one canvas per time (null: no frame there); with a pool, to be used before `pool` more are asked for */
    async *at(ts: number[]): AsyncGenerator<HTMLCanvasElement | null> {
      for await (const s of sink.samplesAtTimestamps(ts)) { if (!s) { yield null; continue; } let c; try { c = draw(s); } finally { s.close(); } yield c; }
    },
    async one(t: number): Promise<HTMLCanvasElement | null> {
      const s = await sink.getSample(t); if (!s) return null;
      try { return draw(s); } finally { s.close(); }
    },
  };
}

/** how many times the picture is halved on its way to w x h (below half its size, one drawing would skip pixels) */
export function halvings(sw: number, sh: number, w: number, h: number): number {
  return 2 * w < sw && 2 * h < sh ? Math.floor(Math.log2(Math.min(sw / w, sh / h))) : 0;
}

/** the frame on screen at `t`: the last one that began by then (null: none yet) */
export function frameAt<T extends { t: number }>(list: T[], t: number): T | null {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].t <= t) lo = mid + 1; else hi = mid; }
  return lo ? list[lo - 1] : null;
}
