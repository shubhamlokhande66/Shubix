import { body } from "../../../server/core/body";
import { route } from "../../../server/core/http";
import { limits } from "../../../server/core/rateLimit";
import { ReviewIn, saveReview } from "../../../server/reviews";

/** A Reel's review after its export (signed in): stars, a comment, what to improve. Admin approves it for Home. */
export const POST = route(async (req) => { limits.review(req); return saveReview(await body(req, ReviewIn)); });
