import { requireAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { deleteReview, listReviews, ReviewStatusIn, setReviewStatus } from "../../../../server/reviews";

/** Admin → Reviews: the list (?status=pending|approved|hidden), approve or hide one (PATCH), delete one (?id=). */
export const GET = route(async (req) => { await requireAdmin(req); return listReviews(new URL(req.url).searchParams.get("status") ?? undefined); });
export const PATCH = route(async (req) => { await requireAdmin(req); return setReviewStatus(await body(req, ReviewStatusIn)); });
export const DELETE = route(async (req) => { await requireAdmin(req); return deleteReview(new URL(req.url).searchParams.get("id") ?? ""); });
