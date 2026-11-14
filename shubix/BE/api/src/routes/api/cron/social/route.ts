import crypto from "node:crypto";
import { settings } from "../../../../server/core/config";
import { NotFoundError } from "../../../../server/core/errors";
import { route } from "../../../../server/core/http";
import { advanceAll } from "../../../../server/social";

/** A scheduler's call (cron-job.org…, header `x-cron-secret: CRON_SECRET`), every 5–15 minutes: scheduled Instagram Reels
 * whose time has come go out even when nobody has the app open. Without CRON_SECRET this route does not exist. */
export const POST = route(async (req) => {
  const key = req.headers.get("x-cron-secret") ?? "", secret = settings.cronSecret;
  if (!secret || key.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret))) throw new NotFoundError("Not found.");
  return advanceAll();
});
