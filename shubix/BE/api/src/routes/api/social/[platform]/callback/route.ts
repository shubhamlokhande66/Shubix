import { route } from "../../../../../server/core/http";
import { NotFoundError } from "../../../../../server/core/errors";
import { callback, PLATFORMS, type Platform } from "../../../../../server/social";

/** The platform's answer after sign-in: the account kept (tokens encrypted), back to My Reels with the result. */
export const GET = route<{ platform: string }>(async (req, { platform }) => {
  if (!PLATFORMS.includes(platform as Platform)) throw new NotFoundError("Not found.");
  return callback(platform as Platform, req);
});
