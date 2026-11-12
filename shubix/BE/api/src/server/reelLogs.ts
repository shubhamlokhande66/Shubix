import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { currentUser } from "./core/auth";
import { mainDb } from "./core/db";

/** One Reel's whole story, top to bottom (Admin → Logs): what the studio did in the browser (the song, each clip, the
 * compression and how much it saved, every call to the API with the JSON sent and received, the export) and what the
 * server did for it (each AI call: the prompt, the pictures sent, the answer, the model, the time and the cost).
 * Grouped by the Reel's id (the studio's project id, sent as the x-reel-id header and with the browser's own lines).
 * Kept 30 days (a TTL index); each entry's JSON is cut to a size that is still readable. */

const ID = /^[A-Za-z0-9_-]{4,40}$/;
const reelCtx = new AsyncLocalStorage<string | null>();
export const currentReel = (): string | null => reelCtx.getStore() ?? null;
/** The request's Reel (its x-reel-id header) for everything it runs. */
export function withReel<T>(req: Request, fn: () => T): T {
  const id = req.headers.get("x-reel-id") ?? "";
  return ID.test(id) ? reelCtx.run(id, fn) : fn();
}

const MAX_JSON = 24_000;
/** The data kept with a line: pictures and long strings shortened, the whole cut to MAX_JSON characters of JSON. */
export function trimData(v: unknown): unknown {
  if (v === undefined) return undefined;
  const seen = new WeakSet<object>();
  let s: string;
  try {
    s = JSON.stringify(v, (_k, x) => {
      if (typeof x === "string") return x.startsWith("data:") ? `[${x.slice(0, x.indexOf(",")).slice(5)} ${x.length} chars]` : x.length > 6000 ? x.slice(0, 6000) + `… [${x.length} chars]` : x;
      if (x && typeof x === "object") {
        if (seen.has(x)) return "[circular]";
        seen.add(x);
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(x)) return `[${x.length} bytes]`;
        if ((x as { type?: string; data?: unknown }).type === "Buffer" && Array.isArray((x as { data?: unknown[] }).data)) return `[${(x as { data: unknown[] }).data.length} bytes]`;
      }
      return x;
    }) ?? "null";
  } catch { return "[not readable]"; }
  if (s.length <= MAX_JSON) { try { return JSON.parse(s); } catch { return s; } }
  return { cut: true, size: s.length, start: s.slice(0, MAX_JSON) };
}

type Line = { step: string; msg: string; data?: unknown; level?: "info" | "warn" | "error"; ms?: number };
/** A server line for the current request's Reel (nothing without one). Never in the way of the work itself. */
export async function reelLog(line: Line) {
  const reelId = currentReel();
  if (!reelId) return;
  try {
    await (await mainDb()).collection("reel_logs").insertOne({ reelId, userId: currentUser() ?? null, source: "server", at: new Date(), seq: 0,
      step: line.step.slice(0, 60), msg: line.msg.slice(0, 500), level: line.level ?? "info", ms: line.ms ?? null, data: trimData(line.data) ?? null });
  } catch (e) { console.warn("reel log not kept:", (e as Error).message); }
}

/** The browser's lines, sent in batches (lib/reelLog.ts). */
export const ClientLines = z.object({
  reelId: z.string().regex(ID),
  lines: z.array(z.object({ t: z.number(), seq: z.number().int().min(0), step: z.string().max(60), msg: z.string().max(500), level: z.enum(["info", "warn", "error"]).default("info"),
    ms: z.number().nullable().optional(), data: z.unknown().optional() })).max(60),
});
export async function recordClientLines(b: z.infer<typeof ClientLines>, ua: string) {
  if (!b.lines.length) return { ok: true };
  const uid = currentUser() ?? null, now = Date.now();
  // the browser's clock, kept if it is near the server's (else the time it arrived)
  const docs = b.lines.map((l) => ({ reelId: b.reelId, userId: uid, source: "browser", at: new Date(Math.abs(l.t - now) < 6 * 3600e3 ? l.t : now), seq: l.seq,
    step: l.step, msg: l.msg, level: l.level, ms: l.ms ?? null, data: trimData(l.data) ?? null, ...(l.seq === 0 ? { ua: ua.slice(0, 300) } : {}) }));
  await (await mainDb()).collection("reel_logs").insertMany(docs, { ordered: false });
  return { ok: true };
}

/** Admin: the latest Reels that have lines (search by id, part of it, or the user's email). */
export async function listReelLogs(q = "") {
  const d = await mainDb(), since = new Date(Date.now() - 30 * 864e5);
  const match: Record<string, unknown> = { at: { $gte: since } };
  const query = q.trim();
  if (query) {
    if (query.includes("@")) {
      const u = await d.collection("users").findOne({ email: query.toLowerCase() }, { projection: { _id: 1 } });
      match.userId = u ? String(u._id) : "-none-";
    } else match.reelId = { $regex: "^" + query.replace(/[^A-Za-z0-9_-]/g, "") };
  }
  const rows = await d.collection("reel_logs").aggregate([
    { $match: match },
    { $group: { _id: "$reelId", first: { $min: "$at" }, last: { $max: "$at" }, lines: { $sum: 1 }, errors: { $sum: { $cond: [{ $eq: ["$level", "error"] }, 1, 0] } },
      warns: { $sum: { $cond: [{ $eq: ["$level", "warn"] }, 1, 0] } }, userId: { $max: "$userId" }, ua: { $max: "$ua" } } },
    { $sort: { last: -1 } }, { $limit: 100 },
  ]).toArray();
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
  const { ObjectId } = await import("mongodb");
  const users = ids.length ? await d.collection("users").find({ _id: { $in: ids.filter((x) => /^[0-9a-f]{24}$/.test(x)).map((x) => new ObjectId(x)) } }, { projection: { email: 1 } }).toArray() : [];
  const email = new Map(users.map((u) => [String(u._id), String(u.email ?? "")]));
  return { reels: rows.map((r) => ({ reelId: String(r._id), first: r.first, last: r.last, lines: r.lines, errors: r.errors, warns: r.warns, user: r.userId ? email.get(String(r.userId)) || String(r.userId) : null, ua: r.ua ?? null })) };
}
/** Admin: one Reel's lines, oldest first (the browser's own order inside a batch). */
export async function reelLogLines(reelId: string) {
  if (!ID.test(reelId)) return { lines: [] };
  const rows = await (await mainDb()).collection("reel_logs").find({ reelId }).sort({ at: 1, seq: 1 }).limit(3000).toArray();
  return { lines: rows.map((r) => ({ id: String(r._id), at: r.at, source: r.source, step: r.step, msg: r.msg, level: r.level, ms: r.ms, data: r.data, ua: r.ua ?? null })) };
}
export async function deleteReelLogs(reelId: string) {
  if (!ID.test(reelId)) return { ok: true };
  await (await mainDb()).collection("reel_logs").deleteMany({ reelId });
  return { ok: true };
}
