import { route } from "../../../../../server/core/http";
import { webhook } from "../../../../../server/credits";

/** Cashfree calls this, signed with the secret key (x-webhook-timestamp, x-webhook-signature). */
export const POST = route(async (req) => webhook(req));
