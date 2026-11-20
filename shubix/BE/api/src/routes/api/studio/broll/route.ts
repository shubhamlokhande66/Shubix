import { isPlanAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { limits } from "../../../../server/core/rateLimit";
import { aiAllowed, requireAiPlan } from "../../../../server/credits";
import { brollOptions, BrollIn, makeBroll } from "../../../../server/studio/broll";

/** Fast Studio's AI pictures (B-roll). GET: whether this server makes them and the styles. POST { prompt, style, aspect, hd }:
 * one new picture as a JPEG data URL (credits: ai_picture, or paid_picture for HD). Shubix AI (Editor and Pro, or credits). */
export const GET = route(async (req) => brollOptions((await aiAllowed(await isPlanAdmin(req), { credits: true })).ok));
export const POST = route(async (req) => {
  await requireAiPlan(await isPlanAdmin(req), { credits: true });
  limits.ai(req);
  return makeBroll(await body(req, BrollIn));
});
