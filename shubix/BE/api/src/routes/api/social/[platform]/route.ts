import { route } from "../../../../server/core/http";
import { NotFoundError } from "../../../../server/core/errors";
import { disconnect, PLATFORMS, type Platform } from "../../../../server/social";

/** Disconnect YouTube or Instagram (the tokens are deleted here; the person can also remove Shubix in that app's settings). */
export const DELETE = route<{ platform: string }>(async (_req, { platform }) => {
  if (!PLATFORMS.includes(platform as Platform)) throw new NotFoundError("Not found.");
  return disconnect(platform as Platform);
});
