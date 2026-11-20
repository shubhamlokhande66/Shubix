import { isPlanAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { limits } from "../../../../server/core/rateLimit";
import { requireAiPlan } from "../../../../server/credits";
import { CaptionIn, writeCaption } from "../../../../server/social";

/** Shubix AI writes a post's title, caption and hashtags from a few words about the video (a small chat: 1 credit). */
export const POST = route(async (req) => {
  await requireAiPlan(await isPlanAdmin(req), { credits: true });
  limits.ai(req);
  return writeCaption(await body(req, CaptionIn));
});
