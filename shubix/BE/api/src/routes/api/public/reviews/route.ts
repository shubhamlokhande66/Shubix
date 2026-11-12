import { route } from "../../../../server/core/http";
import { publicReviews } from "../../../../server/reviews";

/** Home's reviews: only the ones an admin approved (first name, stars, comment). */
export const GET = route(async () => publicReviews());
