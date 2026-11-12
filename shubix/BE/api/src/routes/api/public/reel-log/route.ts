import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { limits } from "../../../../server/core/rateLimit";
import { ClientLines, recordClientLines } from "../../../../server/reelLogs";

/** The studio's lines for one Reel (Admin → Logs), in batches (public: a guest makes Reels too). */
export const POST = route(async (req) => {
  limits.reelLog(req);
  return recordClientLines(await body(req, ClientLines), req.headers.get("user-agent") ?? "");
});
