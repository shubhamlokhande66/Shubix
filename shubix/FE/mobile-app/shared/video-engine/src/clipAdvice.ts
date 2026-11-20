/**
 * How many clips a song asks for, said before the clips are added: "For this song: 10 clips".
 * Read from the Reel's plan (its shots, cut on the song's beats, drops and breaks), the same plan on the website and in
 * the app. Everything else (which clip goes where, fast or slow, the bad parts left out, the check) Shubix does itself.
 *
 * The clips step has three choices, and each takes only what it says:
 * - Videos: videos only, "10 clips". A clip gives about two shots before the Reel looks repeated (two different
 *   moments of it), so the shots / 2 clips, 3 at least and 15 at most (a long Reel just uses each clip a little more).
 *   A calm part takes a clip as well (slow motion, a slow zoom): no photo is asked for.
 * - Photos (a Photo Reel): photos only, one a shot, 8 to 30: "12 photos".
 * - Mix: videos and photos, as many as Videos asks for, in any share: "10 clips or photos". Shubix mixes them.
 * Fewer works too: the Reel is still made, with what was added.
 *
 * Boxes: one a clip asked for, each with the seconds that clip should have at least: the Reel's shots in order, shared
 * out among the clips (whole shots, about as many each), rounded up to half a second. A longer clip is fine: Shubix
 * keeps its best part for that time (sharp, well lit, moving, faces) and leaves the rest out, as every Reel does. A
 * shorter one is said ("1.2 s of 3 s"): Shubix then repeats or slows it. The boxes are a guide to the lengths; with
 * "Mix all clips" Shubix may still place a clip's moments elsewhere in the Reel.
 */
export type MediaPick = "videos" | "photos" | "mix";
export type AdviceSlot = { start: number; end: number; type?: string };
/** clips: videos asked for; photos: photos asked for; either: videos or photos (Mix) */
export type ClipAdvice = { shots: number; clips: number; photos: number; either?: number; boxes?: number[] };

export const ADVICE = { perClip: 2, least: 3, most: 15, photoLeast: 8, photoReelMost: 30 } as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** the choice from the old yes/no (true: a Photo Reel) or the choice itself */
export const mediaPick = (pick: MediaPick | boolean | undefined): MediaPick => (pick === true ? "photos" : pick === false || pick === undefined ? "videos" : pick);

export function clipAdvice(plan: readonly AdviceSlot[] | null | undefined, pick: MediaPick | boolean = "videos"): ClipAdvice | null {
  const n = plan ? plan.length : 0;
  if (!plan || !n) return null;
  const k = mediaPick(pick);
  if (k === "photos") { const p = clamp(n, ADVICE.photoLeast, ADVICE.photoReelMost); return { shots: n, clips: 0, photos: p, boxes: adviceBoxes(plan, p) }; }
  const want = clamp(Math.ceil(n / ADVICE.perClip), ADVICE.least, ADVICE.most), boxes = adviceBoxes(plan, want);
  return k === "mix" ? { shots: n, clips: 0, photos: 0, either: want, boxes } : { shots: n, clips: want, photos: 0, boxes };
}

const upHalf = (v: number) => Math.max(0.5, Math.ceil(v * 2 - 1e-6) / 2);

/** the seconds each of `count` clips should have: the shots in order, shared out (whole shots, about as many each); with
 * more clips than shots, the Reel's time shared out evenly */
export function adviceBoxes(plan: readonly AdviceSlot[], count: number): number[] {
  const n = plan.length, k = Math.max(1, Math.round(count));
  if (!n) return [];
  if (k > n) { const all = plan[n - 1].end - plan[0].start; return Array.from({ length: k }, () => upHalf(all / k)); }
  return Array.from({ length: k }, (_, i) => {
    const a = Math.round((i * n) / k), b = Math.round(((i + 1) * n) / k);
    return upHalf(plan.slice(a, b).reduce((t, s) => t + (s.end - s.start), 0));
  });
}

/** a box and the clip in it: "ok" long enough (longer is fine, its best part is kept), "short" shorter, "empty" none yet */
export function boxFit(need: number, have: number | null | undefined): "ok" | "short" | "empty" {
  if (have == null || !(have > 0)) return "empty";
  return have >= need - 0.05 ? "ok" : "short";
}

/** what a box says: "3 s", "✓ 3 s", "1.2 of 3 s" */
export function boxWords(need: number, have?: number | null): string {
  const s = (v: number) => `${+v.toFixed(1)} s`, f = boxFit(need, have);
  return f === "empty" ? s(need) : f === "ok" ? `✓ ${s(need)}` : `${+(have as number).toFixed(1)} of ${s(need)}`;
}

/** what a file is, by its type or name: a video, a photo, or neither */
export function mediaKindOf(f: { type?: string | null; name?: string | null; mimeType?: string | null; uri?: string }): "video" | "photo" | null {
  const t = (f.type || f.mimeType || "").toLowerCase(), n = (f.name || f.uri || "").toLowerCase();
  if (t.startsWith("video") || /\.(mov|mp4|m4v|3gp|webm|mkv)$/.test(n)) return "video";
  if (t.startsWith("image") || /\.(jpe?g|png|webp|heic|heif|gif)$/.test(n)) return "photo";
  return null;
}

/** whether this choice takes that file (Mix takes both) */
export const pickTakes = (pick: MediaPick, kind: "video" | "photo" | null) => kind !== null && (pick === "mix" || (pick === "videos" ? kind === "video" : kind === "photo"));

const many = (k: number, one: string, more: string) => `${k} ${k === 1 ? one : more}`;

/** "10 clips", "12 photos", "10 clips or photos" */
export function adviceWords(a: ClipAdvice): string {
  if (a.either) return `${a.either} ${a.either === 1 ? "clip or photo" : "clips or photos"}`;
  const parts = [a.clips ? many(a.clips, "clip", "clips") : "", a.photos ? many(a.photos, "photo", "photos") : ""].filter(Boolean);
  return parts.join(" + ");
}

/** What the clips step says: the advice before any clip, then how far the person is (more is optional, never required). */
export function adviceLine(a: ClipAdvice | null, have = 0): string {
  if (!a) return "";
  const want = a.clips + a.photos + (a.either || 0);
  if (!have) return `For this song: ${adviceWords(a)}`;
  if (have >= want) return `Enough for this song (${adviceWords(a)})`;
  const left = want - have;
  return `${have} of ${want} added · ${left} more ${left === 1 ? "makes" : "make"} it better (optional)`;
}
