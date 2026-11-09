import { route } from "../../../../../server/core/http";
import { resendVerify } from "../../../../../server/accounts";
import { limits } from "../../../../../server/core/rateLimit";

/** The sign-up code again: for a sign-up waiting for it, or a signed-in account whose email is not proved yet. */
export const POST = route(async (req) => { limits.account(req); return resendVerify(req); });
