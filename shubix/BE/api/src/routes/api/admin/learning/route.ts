import { requireAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { LearnLogIn, learnedNames, learnReport, saveLearnLog } from "../../../../server/studio/styles";

/** Admin: the learning log of "Teach Shubix from many Reels". GET: the report (what was learned, what could not be:
 * transitions the reader does not know, effects in a shot), or ?names=<kind>: the Reels of that kind already learned.
 * POST: one Reel's reading. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const kind = new URL(req.url).searchParams.get("names");
  return kind ? learnedNames(kind) : learnReport();
});
export const POST = route(async (req) => { await requireAdmin(req); return saveLearnLog(await body(req, LearnLogIn)); });
