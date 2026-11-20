import crypto from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { AppError } from "../core/errors";
import { getProvider, type ManagedProvider } from "../ai";
import { chargeOnce, refund } from "../credits";
import { ART_STYLES, flux, freeAi, paid, paidAi } from "./story";

/** Fast Studio's AI pictures (B-roll): a picture made from a few words, put on the Reel at the playhead (full frame,
 * a slow move). Free AI pictures first (Cloudflare FLUX, when connected: `ai_picture` credits), then the HD ones
 * (OpenAI / Gemini: `paid_picture`). Every picture is new, so every one is charged; a failed one is given back. */

export const ASPECTS = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350], "3:4": [1080, 1440] } as const;
export const BrollIn = z.object({
  prompt: z.string().trim().min(3, "Describe the picture in a few words.").max(400),
  style: z.enum(ART_STYLES.map((s) => s.id) as [string, ...string[]]).default("photo"),
  aspect: z.enum(Object.keys(ASPECTS) as [keyof typeof ASPECTS, ...(keyof typeof ASPECTS)[]]).default("9:16"),
  hd: z.boolean().default(false),
});
export type BrollInput = z.infer<typeof BrollIn>;

export function brollOptions(planAi: boolean) {
  return { available: freeAi() || !!paidAi(), free: freeAi(), hd: !!paidAi(), planAi, styles: ART_STYLES.map(({ id, name }) => ({ id, name })), aspects: Object.keys(ASPECTS) };
}

export function brollPrompt(p: BrollInput) {
  const style = ART_STYLES.find((s) => s.id === p.style) ?? ART_STYLES[0];
  const orient = p.aspect === "16:9" ? "Wide horizontal" : p.aspect === "1:1" ? "Square" : "Vertical";
  return `${style.prompt}. ${p.prompt}. ${orient} ${p.aspect} composition, the subject clear in the centre, room around it. No text, no letters, no logos, no watermark.`.slice(0, 2000);
}

type Maker = (prompt: string) => Promise<{ data: Buffer }>;
/** One picture as a JPEG data URL at the Reel's shape. `makers` are the image services (tests give their own). */
export async function makeBroll(p: BrollInput, makers?: { free?: Maker | null; hd?: Maker | null }): Promise<{ image: string; source: "free_ai" | "paid_ai"; charged: number }> {
  const free = makers ? makers.free ?? null : freeAi() ? flux : null, hd = makers ? makers.hd ?? null : paidAi() ? paid : null;
  const order: [Maker, "free_ai" | "paid_ai", string][] = [];
  if (free && !p.hd) order.push([free, "free_ai", "ai_picture"]);
  if (hd) order.push([hd, "paid_ai", "paid_picture"]);
  if (free && p.hd && !hd) order.push([free, "free_ai", "ai_picture"]);
  if (!order.length) throw new AppError("AI pictures are not connected on this server yet.", { code: "BROLL_UNAVAILABLE", status: 503 });
  const prompt = brollPrompt(p), errors: string[] = [];
  for (const [make, source, cost] of order) {
    const c = await chargeOnce(cost, crypto.randomUUID(), "AI picture in Fast Studio");
    try {
      const pic = await make(prompt);
      const [w, h] = ASPECTS[p.aspect];
      const jpg = await sharp(pic.data, { limitInputPixels: 40_000_000, failOn: "error" }).rotate().resize(w, h, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 86 }).toBuffer();
      return { image: `data:image/jpeg;base64,${jpg.toString("base64")}`, source, charged: c.taken };
    } catch (e) {
      if (c.taken) await refund(c.ref);
      if (e instanceof AppError) throw e;
      errors.push((e as Error).message);
    }
  }
  throw new AppError(`The picture could not be made right now. Please try again. ${errors.join(" · ").slice(0, 160)}`, { code: "BROLL_FAILED", status: 502 });
}

// ------------------------------------------------------------------ pictures for what is said (a Talking Reel's B-roll)
export const BrollPlanIn = z.object({
  lines: z.array(z.object({ i: z.number().int().min(0).max(999), text: z.string().trim().min(1).max(200) })).min(1).max(80),
  count: z.number().int().min(1).max(6).default(3),
});
const Plan = z.object({ picks: z.array(z.object({ i: z.number().int(), prompt: z.string().max(300), style: z.string().max(20).optional() })).max(10) });
const PLAN_SYSTEM = `You are the editor of a talking video (a vlog, a tutorial, a review). You get its sentences, numbered. Choose the sentences where a picture of what is said would help the viewer (a thing, a place, a food, an action, a feeling shown as a scene), as B-roll that covers the speaker for a moment. Not the first sentence (the speaker's face hooks the viewer), never two sentences in a row, spread over the video. For each, write the picture: a short English prompt for an image generator, concrete, no text or letters in the picture, Indian context when the speech suggests it. style: photo (default), cinematic, anime, watercolor or comic.`;
/** Which sentences get a picture, and what each picture shows. `provider` is the AI (tests give their own). */
export async function planBroll(p: z.infer<typeof BrollPlanIn>, provider: () => ManagedProvider = () => getProvider("studio_broll")) {
  const c = await chargeOnce("studio_chat_small", crypto.randomUUID(), "Pictures for what is said");
  try {
    const out = await provider().structured(PLAN_SYSTEM, `Pictures wanted: ${p.count}\n\n${p.lines.map((l) => `#${l.i} ${l.text}`).join("\n")}`, Plan, { task: "studio_broll", temperature: 0.4, maxOutputTokens: 1200 });
    const ids = new Set(p.lines.map((l) => l.i)), first = p.lines[0].i, styles = new Set(ART_STYLES.map((s) => s.id));
    const picks: { i: number; prompt: string; style: string }[] = [];
    for (const x of out.picks) {
      if (!ids.has(x.i) || x.i === first || !x.prompt.trim() || picks.some((y) => Math.abs(y.i - x.i) < 2)) continue;   // known, not the opening, never two in a row
      picks.push({ i: x.i, prompt: x.prompt.trim().slice(0, 300), style: styles.has(x.style ?? "") ? x.style! : "photo" });
      if (picks.length >= p.count) break;
    }
    return { picks: picks.sort((a, b) => a.i - b.i), charged: c.taken };
  } catch (e) {
    if (c.taken) await refund(c.ref);
    throw e;
  }
}
