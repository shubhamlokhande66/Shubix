import { isPlanAdmin } from "../../../../../server/core/admin";
import { body } from "../../../../../server/core/body";
import { route } from "../../../../../server/core/http";
import { limits } from "../../../../../server/core/rateLimit";
import { requireAiPlan } from "../../../../../server/credits";
import { BrollPlanIn, planBroll } from "../../../../../server/studio/broll";

/** A Talking Reel's B-roll: its sentences in, which ones get a picture and what each shows out (a small chat: 1 credit;
 * each picture is then made by POST /api/studio/broll). */
export const POST = route(async (req) => {
  await requireAiPlan(await isPlanAdmin(req), { credits: true });
  limits.ai(req);
  return planBroll(await body(req, BrollPlanIn));
});
