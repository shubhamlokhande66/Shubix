import { z } from "zod";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { register } from "../../../../server/accounts";
import { limits } from "../../../../server/core/rateLimit";

/** Sign up: an account once its emailed code is entered (the published phone app: at once, unproved; see accounts.ts). */
export const POST = route(async (req) => { const p = await body(req, z.object({ email: z.string().min(3).max(254), password: z.string().min(1).max(200), ref: z.string().max(40).optional() })); limits.register(req); return register(p.email, p.password, p.ref, { accountFirst: req.headers.get("x-client") === "mobile" && req.headers.get("x-signup") !== "code-first" }); });
