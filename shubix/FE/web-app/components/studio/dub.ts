/* AI dubbing of a Talking Reel: the words the person says, in sentences with their times; each sentence translated and
 * spoken by an AI voice; each spoken sentence put where the original one starts, made a little faster (pitch kept)
 * when it would run into the next one. The pure parts, used by components/studio/engine.ts (makeDub). */

export type DubWord = { text: string; start: number; end: number };
export type DubSeg = { i: number; start: number; end: number; text: string };

export const DUB_LANGS: [string, string][] = [["hi", "Hindi"], ["mr", "Marathi"], ["en", "English"], ["hinglish", "Hinglish"], ["gu", "Gujarati"], ["bn", "Bengali"], ["ta", "Tamil"], ["te", "Telugu"], ["pa", "Punjabi"]];
export const DUB_MAX_SECONDS = 180;
const MAX_CHARS = 150, MAX_SEG = 12, GAP = 0.6;

/** The words in sentences: a full stop (। too), a pause over 0.6 s, 12 s or 150 characters end one. */
export function dubSegments(words: DubWord[]): DubSeg[] {
  const out: DubSeg[] = [];
  let cur: DubWord[] = [];
  const close = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text.trim()).filter(Boolean).join(" ").replace(/\s+([,.?!।])/g, "$1").trim();
    if (text) out.push({ i: out.length, start: cur[0].start, end: cur[cur.length - 1].end, text });
    cur = [];
  };
  const ws = words.filter((w) => w.text && w.text.trim() && w.end >= w.start).sort((a, b) => a.start - b.start);
  ws.forEach((w, k) => {
    const next = ws[k + 1], chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && chars > MAX_CHARS) close();
    cur.push(w);
    if (/[.?!।॥]["')]*$/.test(w.text.trim()) || !next || next.start - w.end > GAP || w.end - cur[0].start > MAX_SEG) close();
  });
  close();
  return out;
}

/** The sound made `f` times shorter with its pitch kept (WSOLA: 30 ms windows, each joined where it lines up best). */
export function stretch(x: Float32Array, sr: number, f: number): Float32Array {
  if (f <= 1.001 || x.length < sr * 0.1) return x;
  const W = Math.round(sr * 0.03), H = W >> 1, tol = Math.round(sr * 0.008), win = new Float32Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
  const outLen = Math.max(1, Math.floor(x.length / f)), y = new Float32Array(outLen + W), norm = new Float32Array(outLen + W);
  let prev = 0;
  for (let o = 0; o < outLen; o += H) {
    const want = Math.round(o * f);
    let best = Math.min(Math.max(0, want), Math.max(0, x.length - W));
    if (o > 0) { // the window that best continues the last one (its natural next hop)
      let bestC = -Infinity;
      const nat = prev + H;
      for (let d = -tol; d <= tol; d += 2) {
        const s = want + d;
        if (s < 0 || s + W > x.length) continue;
        let c = 0;
        for (let i = 0; i < H; i += 2) c += (x[s + i] || 0) * (x[nat + i] || 0);
        if (c > bestC) { bestC = c; best = s; }
      }
    }
    for (let i = 0; i < W && o + i < y.length; i++) { y[o + i] += (x[best + i] || 0) * win[i]; norm[o + i] += win[i]; }
    prev = best;
  }
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = norm[i] > 1e-3 ? y[i] / norm[i] : 0;
  return out;
}

/** Linear resampling (the AI voice's rate to the Reel's). */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const n = Math.max(1, Math.round((x.length * to) / from)), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const t = i * r, j = Math.floor(t), a = t - j; y[i] = (x[j] || 0) * (1 - a) + (x[j + 1] ?? x[j] ?? 0) * a; }
  return y;
}

const trimSilence = (x: Float32Array, sr: number) => {
  const th = 0.01; let a = 0, b = x.length - 1;
  while (a < b && Math.abs(x[a]) < th) a++;
  while (b > a && Math.abs(x[b]) < th) b--;
  return x.subarray(Math.max(0, a - Math.round(sr * 0.02)), Math.min(x.length, b + Math.round(sr * 0.06)));
};

/** The dubbed voice track, N samples at `sr`: each sentence at its original start (or just after the one before),
 * sped up to at most 1.35× (pitch kept) to end before the next sentence; past that it runs on into the pause. Returns
 * the track and how much of the speech had to be sped up. */
export function placeDub(segs: DubSeg[], spoken: { pcm: Float32Array; sr: number }[], N: number, sr: number, rms = 0.1): { pcm: Float32Array; stretched: number; cut: number } {
  const out = new Float32Array(N);
  let at = 0, stretched = 0, cut = 0;
  segs.forEach((s, k) => {
    const sp = spoken[k];
    if (!sp || !sp.pcm.length) return;
    let x = trimSilence(resample(sp.pcm, sp.sr, sr), sr);
    let sq = 0; for (let i = 0; i < x.length; i += 2) sq += x[i] * x[i];
    const g = rms / Math.max(0.005, Math.sqrt(sq / Math.max(1, x.length / 2)));
    const start = Math.max(Math.round(s.start * sr), at);
    const nextStart = k + 1 < segs.length ? Math.round(segs[k + 1].start * sr) : N;
    const room = Math.max(Math.round(sr * 0.3), nextStart - start - Math.round(sr * 0.05));
    if (x.length > room) { const f = Math.min(1.35, x.length / room); x = stretch(x, sr, f); stretched++; }
    const n = Math.min(x.length, N - start);
    if (n < x.length) cut++;
    const fade = Math.round(sr * 0.008);
    for (let i = 0; i < n; i++) { let v = x[i] * g; if (i < fade) v *= i / fade; else if (i > n - fade) v *= (n - i) / fade; out[start + i] = Math.max(-1, Math.min(1, v)); }
    at = start + n + Math.round(sr * 0.05);
  });
  return { pcm: out, stretched, cut };
}

/** Where the dubbed voice speaks (for the music stepping back under it): 1 while speaking, in 20 ms steps. */
export function activity(pcm: Float32Array, sr: number): Float32Array {
  const act = new Float32Array(pcm.length), hop = Math.round(sr * 0.02);
  for (let a = 0; a < pcm.length; a += hop) {
    let m = 0; for (let i = a; i < Math.min(pcm.length, a + hop); i++) m = Math.max(m, Math.abs(pcm[i]));
    if (m > 0.02) act.fill(1, Math.max(0, a - hop * 5), Math.min(pcm.length, a + hop * 10));
  }
  return act;
}
