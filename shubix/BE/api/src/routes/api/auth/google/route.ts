import { route } from "../../../../server/core/http";
import { start } from "../../../../server/googleSignIn";

/** "Continue with Google": off to Google's account chooser (?next= the page to come back to, ?ref= a friend's invite). */
export const GET = route(async (req) => start(req));
