import { route } from "../../../../../server/core/http";
import { NotFoundError } from "../../../../../server/core/errors";
import { connect, connectLink, PLATFORMS, type Platform } from "../../../../../server/social";

/** Connect YouTube or Instagram: the browser goes to the platform's sign-in and comes back to …/callback. */
export const GET = route<{ platform: string }>(async (req, { platform }) => {
  if (!PLATFORMS.includes(platform as Platform)) throw new NotFoundError("Not found.");
  return connect(platform as Platform, req);
});
/** The Android app: the link to open in the phone's browser (it carries who is connecting, sealed, for 10 minutes). */
export const POST = route<{ platform: string }>(async (_req, { platform }) => {
  if (!PLATFORMS.includes(platform as Platform)) throw new NotFoundError("Not found.");
  return connectLink(platform as Platform);
});
