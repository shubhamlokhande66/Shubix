import { isPlanAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { requireAiPlan } from "../../../../server/credits";
import { requireFeature } from "../../../../server/core/features";
import { route } from "../../../../server/core/http";
import { compareShots, CompareIn } from "../../../../server/studio/compareShots";
import { limits } from "../../../../server/core/rateLimit";

/** The Reel's best moments seen side by side (after rank-shots): part of the AI Reel, no credits of its own. */
export const POST = route(async (req) => {
  await requireFeature(req, "studioAI");
  await requireAiPlan(await isPlanAdmin(req), { credits: true });
  limits.ai(req); // each AI call costs money
  return compareShots(await body(req, CompareIn));
});
