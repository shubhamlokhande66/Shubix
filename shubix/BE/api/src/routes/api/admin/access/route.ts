import { z } from "zod";
import { requireAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { setAccess } from "../../../../server/core/access";

const AccessIn = z.object({ open: z.array(z.string().max(40)).max(40).optional(), google: z.boolean().optional() });

/** Change the sign-in rules (administrator only). */
export const PUT = route(async (req) => {
  await requireAdmin(req);
  return setAccess(await body(req, AccessIn));
});
