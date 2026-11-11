import { z } from "zod";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { verifyPayment } from "../../../../server/credits";

/** The payment window closed, or Cashfree came back to the plans: the order is checked with Cashfree itself. */
export const POST = route(async (req) => {
  const p = await body(req, z.object({ orderId: z.string().max(60) }));
  return verifyPayment(p.orderId);
});
