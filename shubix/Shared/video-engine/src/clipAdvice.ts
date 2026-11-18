/**
 * How many clips (and photos) a song asks for, said before the clips are added: "For this song: 8 clips + 2 photos".
 * Read from the Reel's plan (its shots, cut on the song's beats, drops and breaks), the same plan on the website and in
 * the app. Everything else (which clip goes where, fast or slow, the bad parts left out, the check) Shubix does itself.
 *
 * - A clip gives about two shots before the Reel looks repeated (two different moments of it), so the shots / 2 clips,
 *   3 at least and 15 at most (more is never asked: a long Reel just uses each clip a little more).
 * - Photos fit the calm shots: a break, or a long shot that is not a drop or a hit, never the opening (it should move).
 *   Half of those, a quarter of what is asked at most, 3 at most. They are offered, not required: a clip does as well.
 * - A Photo Reel asks for photos only: one a shot, 8 to 30.
 * Fewer works too: the Reel is still made, with what was added.
 */
export type AdviceSlot = { start: number; end: number; type?: string };
export type ClipAdvice = { shots: number; clips: number; photos: number };

export const ADVICE = { perClip: 2, least: 3, most: 15, calmLen: 1.8, photoShare: 0.25, photoMost: 3, photoLeast: 8, photoReelMost: 30 } as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function clipAdvice(plan: readonly AdviceSlot[] | null | undefined, photoReel = false): ClipAdvice | null {
  const n = plan ? plan.length : 0;
  if (!plan || !n) return null;
  if (photoReel) return { shots: n, clips: 0, photos: clamp(n, ADVICE.photoLeast, ADVICE.photoReelMost) };
  const total = clamp(Math.ceil(n / ADVICE.perClip), ADVICE.least, ADVICE.most);
  const calm = plan.filter((s, i) => i > 0 && s.type !== "drop" && s.type !== "hit" && (s.type === "break" || s.end - s.start >= ADVICE.calmLen)).length;
  const photos = Math.min(Math.floor(calm / 2), Math.floor(total * ADVICE.photoShare), ADVICE.photoMost);
  return { shots: n, clips: total - photos, photos };
}

const many = (k: number, one: string, more: string) => `${k} ${k === 1 ? one : more}`;

/** "8 clips + 2 photos", "10 clips", "12 photos" */
export function adviceWords(a: ClipAdvice): string {
  const parts = [a.clips ? many(a.clips, "clip", "clips") : "", a.photos ? many(a.photos, "photo", "photos") : ""].filter(Boolean);
  return parts.join(" + ");
}

/** What the clips step says: the advice before any clip, then how far the person is (more is optional, never required). */
export function adviceLine(a: ClipAdvice | null, have = 0): string {
  if (!a) return "";
  const want = a.clips + a.photos;
  if (!have) return `For this song: ${adviceWords(a)}`;
  if (have >= want) return `Enough for this song (${adviceWords(a)})`;
  const left = want - have;
  return `${have} of ${want} added · ${left} more ${left === 1 ? "makes" : "make"} it better (optional)`;
}
