import { route } from "../../../../../server/core/http";
import { callback } from "../../../../../server/googleSignIn";

/** Google's answer: signed in (or a new account), then back to the page the person was on. */
export const GET = route(async (req) => callback(req));
