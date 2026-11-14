import { z } from "zod";
import { getProvider, type ManagedProvider } from "../ai";
import { ValidationFailed } from "../core/errors";
import { chargeOnce, refund } from "../credits";

/** Clips from a long video (a podcast, a talk, a vlog): the phone transcribes the video's voice (/api/studio/transcribe,
 * part by part) and sends the words here. Shubix finds the moments that work on their own as a Reel: they start on a
 * strong sentence, end on a finished thought and keep talking. Each gets a score (how likely it is to do well), a title
 * and a hook for the screen. Shubix AI judges the best candidates; without it (Free, or the AI not answering) the plain
 * scoring below still picks them. The video itself never leaves the phone. */

export const COST_ACTION = "studio_moments";
export const LENGTHS = { short: [15, 35], medium: [30, 60], long: [55, 90] } as const;
export type Length = keyof typeof LENGTHS;

const Word = z.object({ text: z.string().max(80), start: z.number().min(0), end: z.number().min(0) });
export const MomentsIn = z.object({
  words: z.array(Word).min(20, "The video needs more talking to find clips.").max(60_000),
  duration: z.number().positive().max(4 * 3600),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  count: z.number().int().min(1).max(10).default(6),
  /** the video's fingerprint on the phone: finding its clips again is not charged again */
  key: z.string().min(4).max(120),
});
export type MomentsInput = z.infer<typeof MomentsIn>;
type W = z.infer<typeof Word>;

export interface Sentence { start: number; end: number; text: string; words: number }
export interface Moment { start: number; end: number; text: string; score: number; title: string; hook: string; reason: string }

const END = /[.?!।॥…]["')\]]*$/u;
/** The words in sentences: a sentence ends on its full stop (। too), a pause over 0.8 s, or after 15 s. */
export function sentences(words: W[]): Sentence[] {
  const out: Sentence[] = [];
  let cur: W[] = [];
  const close = () => {
    if (!cur.length) return;
    out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text.trim()).join(" ").replace(/\s+([,.?!।])/g, "$1"), words: cur.length });
    cur = [];
  };
  const ws = words.filter((w) => w.text.trim() && w.end >= w.start).sort((a, b) => a.start - b.start);
  ws.forEach((w, i) => {
    cur.push(w);
    const next = ws[i + 1];
    if (END.test(w.text.trim()) || !next || next.start - w.end > 0.8 || w.end - cur[0].start > 15) close();
  });
  close();
  return out;
}

const HOOK = /\?|\b(why|how|what|never|always|secret|mistake|stop|truth|nobody|everyone|best|worst|biggest|first|only|actually|problem|money|free|you|your|kyu|kyon|kaise|kya|aap|tum|tumhi|tumhala|aapko|kasa|kase|ka|sach|galti|paisa|paise|kabhi|nahi)\b|\d/iu;
const WEAK_START = /^(and|but|so|because|or|also|then|um|uh|like|aur|lekin|par|toh|to|ani|pan|mhanun|kara)\b/iu;

/** 0–100 without the AI: a strong first sentence, a finished last one, steady talking (no long silences). */
export function plainScore(parts: Sentence[]): number {
  const first = parts[0], last = parts[parts.length - 1];
  const dur = last.end - first.start, words = parts.reduce((n, s) => n + s.words, 0);
  const spoken = parts.reduce((n, s) => n + (s.end - s.start), 0);
  const pace = words / Math.max(dur, 1); // words a second: 2–3.5 keeps people watching
  let s = 50;
  if (HOOK.test(first.text)) s += 15;
  if (first.text.includes("?")) s += 5;
  if (WEAK_START.test(first.text.trim())) s -= 15;
  if (END.test(last.text.trim())) s += 10; else s -= 10;
  s += pace >= 2 && pace <= 3.6 ? 10 : pace < 1.3 ? -15 : 0;
  s -= Math.round(Math.max(0, 1 - spoken / Math.max(dur, 1) - 0.15) * 60); // long silences inside
  return Math.max(0, Math.min(100, s));
}

/** Every stretch of whole sentences inside the length, from every start; the best one per start. */
export function candidates(all: Sentence[], length: Length) {
  const [min, max] = LENGTHS[length];
  const out: { start: number; end: number; parts: Sentence[]; plain: number }[] = [];
  for (let i = 0; i < all.length; i++) {
    let best: (typeof out)[number] | null = null;
    for (let j = i; j < all.length; j++) {
      const dur = all[j].end - all[i].start;
      if (dur > max) break;
      if (dur < min) continue;
      const parts = all.slice(i, j + 1), plain = plainScore(parts);
      if (!best || plain > best.plain) best = { start: all[i].start, end: all[j].end, parts, plain };
    }
    if (best) out.push(best);
  }
  return out;
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end - 1 && b.start < a.end - 1;
/** The best ones first, none sharing more than a second with one already taken. */
export function pickApart<T extends { start: number; end: number }>(list: T[], score: (x: T) => number, n: number): T[] {
  const taken: T[] = [];
  for (const x of [...list].sort((a, b) => score(b) - score(a))) {
    if (taken.length >= n) break;
    if (!taken.some((t) => overlaps(t, x))) taken.push(x);
  }
  return taken;
}

const titleOf = (text: string) => { const t = text.split(/(?<=[.?!।])\s/u)[0].trim(); return t.length > 70 ? t.slice(0, 67).trimEnd() + "…" : t; };

const Judged = z.object({
  clips: z.array(z.object({
    id: z.number().int(),
    score: z.number().min(0).max(100),
    title: z.string().max(120),
    hook: z.string().max(120),
    reason: z.string().max(240),
  })).max(40),
});
const SYSTEM = `You are the editor of a top short-video channel. You get numbered candidate moments cut from one long video (its transcript, with times). Judge each as a stand-alone vertical Reel for Instagram / YouTube Shorts: does the first sentence stop the scroll, does it make sense without the rest of the video, does it end on a finished thought, is it surprising, useful, funny or emotional?
For every candidate give: score 0-100 (how likely it is to do well; be strict, most are under 70), title (a short catchy title, max 8 words), hook (max 8 words of on-screen text for the first 2 seconds), reason (one short sentence why). Write title and hook in the transcript's own language and script. Answer for every id you were given.`;

/** The clips of a long video, best first. `ai`: Shubix AI is in the person's plan. */
export async function findMoments(p: MomentsInput, ai = true, provider: () => ManagedProvider = () => getProvider("studio_moments")): Promise<{ clips: Moment[]; by: "ai" | "simple"; charged: number; candidates: number }> {
  const words = p.words.filter((w) => w.start <= p.duration + 1);
  const all = sentences(words);
  if (!all.length) throw new ValidationFailed("No speech was found in this video.", { code: "MOMENTS_NO_SPEECH" });
  const cands = candidates(all, p.length);
  if (!cands.length) throw new ValidationFailed("The talking in this video is too short for clips of this length. Try a shorter length.", { code: "MOMENTS_TOO_SHORT" });
  // the AI judges the best plain candidates (spread over the video: none sharing a second)
  const pool = pickApart(cands, (c) => c.plain, Math.max(p.count * 4, 12)).slice(0, 30);
  const plainClip = (c: (typeof pool)[number], j?: z.infer<typeof Judged>["clips"][number]): Moment => {
    const text = c.parts.map((s) => s.text).join(" ");
    return {
      start: +c.start.toFixed(2), end: +c.end.toFixed(2), text: text.slice(0, 1200),
      score: Math.round(j ? 0.75 * j.score + 0.25 * c.plain : c.plain),
      title: (j?.title.trim() || titleOf(text)).slice(0, 80), hook: (j?.hook.trim() || titleOf(text)).slice(0, 80), reason: (j?.reason.trim() || "").slice(0, 200),
    };
  };
  if (ai) {
    let ref = "";
    try {
      const c = await chargeOnce(COST_ACTION, p.key, "Clips from a long video");
      ref = c.taken ? c.ref : "";
      const list = pool.map((c, i) => `#${i} [${c.start.toFixed(0)}s–${c.end.toFixed(0)}s] ${c.parts.map((s) => s.text).join(" ").slice(0, 700)}`).join("\n\n");
      const out = await provider().structured(SYSTEM, `Candidates (${pool.length}):\n\n${list}`, Judged, { task: "studio_moments", temperature: 0.3, maxOutputTokens: 4000 });
      const byId = new Map(out.clips.filter((j) => j.id >= 0 && j.id < pool.length).map((j) => [j.id, j]));
      if (byId.size < Math.min(3, pool.length)) throw new Error("too few judged");
      const judged = pool.map((c, i) => plainClip(c, byId.get(i)));
      return { clips: pickApart(judged, (m) => m.score, p.count), by: "ai", charged: c.taken, candidates: cands.length };
    } catch (e) {
      if (ref) await refund(ref);
      if ((e as { status?: number }).status === 402) throw e; // no credits left: the person decides (top up, or the plain picks)
    }
  }
  return { clips: pickApart(pool.map((c) => plainClip(c)), (m) => m.score, p.count), by: "simple", charged: 0, candidates: cands.length };
}
