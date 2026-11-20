import { isPlanAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { limits } from "../../../../server/core/rateLimit";
import { aiAllowed } from "../../../../server/credits";
import { findMoments, MomentsIn } from "../../../../server/studio/moments";

/** Clips from a long video: the video's words (with their times) in, its best moments out, best first, each with a
 * score, a title and a hook. Shubix AI judges them on Editor and Pro (once per video); Free gets the plain picks. */
export const POST = route(async (req) => {
  limits.ai(req);
  const p = await body(req, MomentsIn);
  return findMoments(p, (await aiAllowed(await isPlanAdmin(req))).ok);
});
