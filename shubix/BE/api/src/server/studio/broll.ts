import crypto from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { AppError } from "../core/errors";
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
