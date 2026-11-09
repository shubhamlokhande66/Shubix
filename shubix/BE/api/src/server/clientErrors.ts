import crypto from "node:crypto";
import { z } from "zod";
import { currentUser } from "./core/auth";
import { db } from "./core/db";

/** Errors in people's browsers (the app or the studio breaking on a phone), kept on our own server so the administrator
 * sees them without an outside service: the same error is one row with a count, the page and device it was seen on last.
 * Kept 30 days. Nothing personal: the message, where in the code, the page, the browser. */
export const ClientError = z.object({
  // api: a call that still failed after its 3 tries; ai: Shubix AI could not make a Reel (its step and why); server: a
  // request that failed on our server (recordServerError)
  kind: z.enum(["error", "rejection", "studio", "webgl", "clip", "audio", "crash", "perf", "api", "ai", "server"]).default("error"),
  message: z.string().max(400),
  stack: z.string().max(2000).default(""),
  path: z.string().max(300).default("/"),
});
const clip = (s: string, n: number) => s.replace(/[\u0000-\u001f]+/g, " ").slice(0, n);
export async function recordClientError(e: z.infer<typeof ClientError>, ua: string, user?: string | null) {
  const message = clip(e.message, 400), where = clip(e.stack.split("\n").find((l) => /at |@/.test(l)) ?? "", 200);
  const id = crypto.createHash("sha1").update(`${e.kind}|${message}|${where}`).digest("hex").slice(0, 20);
  const now = new Date(), uid = user ?? currentUser() ?? null;
  await (await db()).collection("client_errors").updateOne({ _id: id as unknown as import("mongodb").ObjectId },
    { $setOnInsert: { firstAt: now, kind: e.kind, message, where }, $set: { lastAt: now, path: clip(e.path, 300), ua: clip(ua, 300), stack: clip(e.stack, 2000), ...(uid ? { lastUser: uid } : {}) }, $inc: { count: 1 } },
    { upsert: true });
  return { ok: true };
}
/** A request that failed on our server: every 5xx, and every failure of Shubix AI's own calls (/api/studio/*) except a
 * missing sign-in, with its status, error code and message, the device and the person (Admin → Errors, kind "server"). */
export function recordServerError(req: Request, status: number, e: unknown, user?: string | null) {
  const path = new URL(req.url).pathname;
  if (path === "/api/public/client-error" || status === 401 || (status < 500 && !path.startsWith("/api/studio/"))) return;
  const err = e as { message?: string; code?: string; stack?: string } | null;
  const message = `${status} ${req.method} ${path}: ${err?.code ? err.code + " · " : ""}${err?.message ?? String(e)}`;
  void recordClientError({ kind: "server", message, stack: err?.stack ?? "", path }, req.headers.get("user-agent") ?? "", user).catch(() => {});
}
export async function listClientErrors() {
  const since = new Date(Date.now() - 30 * 864e5), c = (await db()).collection("client_errors");
  void c.deleteMany({ lastAt: { $lt: since } }).catch(() => {});
  const rows = await c.find({ lastAt: { $gte: since } }).sort({ lastAt: -1 }).limit(200).toArray();
  return { errors: rows.map((r) => ({ id: String(r._id), kind: r.kind, message: r.message, where: r.where, count: r.count ?? 1, firstAt: r.firstAt, lastAt: r.lastAt, path: r.path, ua: r.ua, stack: r.stack })) };
}
export async function clearClientError(id: string) { await (await db()).collection("client_errors").deleteOne({ _id: id as unknown as import("mongodb").ObjectId }); return { ok: true }; }
