import { z } from "zod";
import { requireAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { deleteReelLogs, listReelLogs, reelLogLines } from "../../../../server/reelLogs";

/** Admin → Logs: ?reel=<id> one Reel's lines top to bottom; else the latest Reels (?q= an id, its start, or an email). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const u = new URL(req.url), reel = u.searchParams.get("reel");
  return reel ? reelLogLines(reel) : listReelLogs(u.searchParams.get("q") ?? "");
});
export const DELETE = route(async (req) => { await requireAdmin(req); return deleteReelLogs((await body(req, z.object({ reelId: z.string().max(40) }))).reelId); });
