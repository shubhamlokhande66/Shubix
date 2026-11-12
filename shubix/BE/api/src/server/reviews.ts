import { ObjectId } from "mongodb";
import { z } from "zod";
import { AuthRequired, currentUser } from "./core/auth";
import { mainDb } from "./core/db";
import { AppError } from "./core/errors";

/** Reviews of a finished Reel: the studio asks once after a Reel is exported (stars, a comment, what to improve). Each lands
 * in Admin → Reviews as "pending"; only the ones an admin approves show on Home (the comment, the stars, the first name).
 * The improvement note is for the team only, never shown. One review per person per Reel (sent again: it is updated). */

export const ReviewIn = z.object({
  reelId: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).default(""),
  improvement: z.string().trim().max(1000).default(""),
});
export type ReviewStatus = "pending" | "approved" | "hidden";

const col = async () => (await mainDb()).collection("reviews");
const firstName = (u: Record<string, unknown> | null) => {
  const n = typeof u?.name === "string" && u.name.trim() ? u.name.trim().split(/\s+/)[0] : typeof u?.username === "string" ? u.username : String(u?.email ?? "").split("@")[0];
  return (n || "A creator").slice(0, 30);
};

export async function saveReview(p: z.infer<typeof ReviewIn>) {
  const uid = currentUser(); if (!uid) throw new AuthRequired();
  const u = /^[0-9a-f]{24}$/.test(uid) ? await (await mainDb()).collection("users").findOne({ _id: new ObjectId(uid) }, { projection: { name: 1, username: 1, email: 1 } }) : null;
  const now = new Date();
  // a changed review is checked again before it shows on Home
  await (await col()).updateOne({ userId: uid, reelId: p.reelId },
    { $set: { rating: p.rating, comment: p.comment, improvement: p.improvement, name: firstName(u), email: u?.email ?? null, status: "pending", updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true });
  return { ok: true };
}

/** Home: the approved reviews with a comment, newest first. */
export async function publicReviews() {
  const rows = await (await col()).find({ status: "approved", comment: { $ne: "" } }, { projection: { name: 1, rating: 1, comment: 1, approvedAt: 1 } })
    .sort({ approvedAt: -1 }).limit(12).toArray();
  return { reviews: rows.map((r) => ({ id: String(r._id), name: r.name, rating: r.rating, comment: r.comment })) };
}

/** Admin → Reviews: by status (all when none), newest first. */
export async function listReviews(status?: string) {
  const q = status && ["pending", "approved", "hidden"].includes(status) ? { status } : {};
  const c = await col();
  const [rows, counts] = await Promise.all([
    c.find(q).sort({ updatedAt: -1 }).limit(300).toArray(),
    c.aggregate<{ _id: ReviewStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
  ]);
  return {
    reviews: rows.map((r) => ({ id: String(r._id), reelId: r.reelId, name: r.name, email: r.email ?? null, rating: r.rating, comment: r.comment, improvement: r.improvement, status: r.status, at: r.updatedAt })),
    counts: Object.fromEntries(counts.map((x) => [x._id, x.n])) as Partial<Record<ReviewStatus, number>>,
  };
}

export const ReviewStatusIn = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/), status: z.enum(["pending", "approved", "hidden"]) });
export async function setReviewStatus(p: z.infer<typeof ReviewStatusIn>) {
  const r = await (await col()).updateOne({ _id: new ObjectId(p.id) }, { $set: { status: p.status, ...(p.status === "approved" ? { approvedAt: new Date() } : {}) } });
  if (!r.matchedCount) throw new AppError("That review is gone.", { code: "NOT_FOUND", status: 404 });
  return { ok: true };
}
export async function deleteReview(id: string) {
  if (/^[0-9a-f]{24}$/.test(id)) await (await col()).deleteOne({ _id: new ObjectId(id) });
  return { ok: true };
}
