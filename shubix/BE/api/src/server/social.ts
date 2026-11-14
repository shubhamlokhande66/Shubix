import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { z } from "zod";
import { getProvider } from "./ai";
import { currentUser, withUser } from "./core/auth";
import { settings } from "./core/config";
import { db, mainDb, ObjectId, OWNER, parseId } from "./core/db";
import { AppError, NotFoundError, ValidationFailed } from "./core/errors";
import { chargeOnce, refund } from "./credits";
import { localPath } from "./storage/local";
import { objectUrl, r2Config } from "./storage/r2";

/**
 * Publish to Instagram and YouTube: a Reel kept in My Reels goes straight to the person's own Instagram (as a Reel) and
 * YouTube channel (as a Short), now or at a time they choose, and its views and likes come back here.
 *
 * - Connecting: OAuth on each platform (YouTube: the app's Google client, scope youtube.upload + youtube.readonly;
 *   Instagram: "Instagram API with Instagram Login", scopes instagram_business_basic + instagram_business_content_publish,
 *   a Business or Creator account). The tokens are kept encrypted (AES-256-GCM, a key from SECRET_KEY).
 * - Publishing is a small state machine kept in `social_posts`, moved on in short steps while the person's page asks how
 *   it is going (every few seconds), or by /api/cron/social for the times nobody is here: the server can sleep between
 *   requests, so no step waits on its own. YouTube's own schedule (publishAt) does the waiting for a scheduled Short;
 *   a scheduled Instagram Reel goes out at the first step after its time.
 * - Instagram fetches the video itself from a short-lived link to the file in R2 (so it needs R2, as production has).
 */

export const PLATFORMS = ["youtube", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];
const IG_API = "https://graph.instagram.com/v21.0";
const base = () => (settings.publicBaseUrl || "http://localhost:3000").replace(/\/+$/, "");
export const callbackUrl = (p: Platform) => `${base()}/api/social/${p}/callback`;
export const ready = (p: Platform) => (p === "youtube" ? !!(settings.googleClientId && settings.googleClientSecret) : !!(settings.instagramAppId && settings.instagramAppSecret));

// ------------------------------------------------------------------ tokens, kept encrypted
const key = () => crypto.createHash("sha256").update(`${settings.secretKey || "dev"}|social-tokens`).digest();
export function seal(text: string): string {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv), body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
export function open(sealed: string): string {
  const [iv, tag, body] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

interface AccountDoc { _id: ObjectId; platform: Platform; remoteId: string; name: string; access: string; refresh?: string; expiresAt: number; connectedAt: Date; [OWNER]?: string }
export interface PostDoc {
  _id: ObjectId; platform: Platform; reelId: string; reelName: string; caption: string; title: string; at: Date;
  status: "scheduled" | "working" | "published" | "failed" | "cancelled"; step?: string; container?: string; remoteId?: string; url?: string;
  error?: string; tries: number; lockedUntil?: number; stats?: { views?: number; likes?: number; comments?: number; at: number }; createdAt: Date; [OWNER]?: string;
}
const accounts = async () => (await db()).collection<AccountDoc>("social_accounts");
const posts = async () => (await db()).collection<PostDoc>("social_posts");

// ------------------------------------------------------------------ connecting (OAuth)
const COOKIE = "s_oauth";
const go = (to: string, cookie?: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const stateCookie = (v: string, age: number) => `${COOKIE}=${v}; Max-Age=${age}; Path=/api/social; HttpOnly; SameSite=Lax${settings.cookieSecure ? "; Secure" : ""}`;
const back = (p: Platform, result: string) => go(`${base()}/reels?tab=saved&social=${p}&result=${encodeURIComponent(result)}`, stateCookie("", 0));

export function connect(p: Platform) {
  if (!ready(p)) throw new AppError(`${p === "youtube" ? "YouTube" : "Instagram"} is not connected on this server yet.`, { code: "SOCIAL_OFF", status: 404 });
  const state = crypto.randomBytes(18).toString("base64url");
  const url = p === "youtube"
    ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: settings.googleClientId, redirect_uri: callbackUrl(p), response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly" })}`
    : `https://www.instagram.com/oauth/authorize?${new URLSearchParams({ client_id: settings.instagramAppId, redirect_uri: callbackUrl(p), response_type: "code", state,
      scope: "instagram_business_basic,instagram_business_content_publish" })}`;
  return go(url, stateCookie(`${p}.${state}`, 600));
}

type Fetch = typeof fetch;
async function json<T>(r: Response, what: string): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } | string; error_message?: string };
  if (!r.ok) {
    const msg = typeof j.error === "string" ? j.error : j.error?.message || j.error_message || `${r.status}`;
    throw new AppError(`${what}: ${String(msg).slice(0, 200)}`, { code: "SOCIAL_REMOTE", status: 502 });
  }
  return j;
}

export async function callback(p: Platform, req: Request, f: Fetch = fetch) {
  const q = new URL(req.url).searchParams, [cp, state] = (/(?:^|;\s*)s_oauth=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1] ?? "").split(".");
  if (cp !== p || !state || q.get("state") !== state) return back(p, "state");
  if (q.get("error") || !q.get("code")) return back(p, "cancelled");
  if (settings.authEnabled && !currentUser()) return back(p, "signin");
  try {
    const acc = p === "youtube" ? await youtubeTokens(q.get("code")!, f) : await instagramTokens(q.get("code")!, f);
    const col = await accounts();
    await col.deleteMany({ platform: p });
    await col.insertOne({ _id: new ObjectId(), platform: p, ...acc, connectedAt: new Date() });
    return back(p, "ok");
  } catch (e) {
    console.warn(`social ${p} connect:`, (e as Error).message);
    return back(p, "failed");
  }
}

async function youtubeTokens(code: string, f: Fetch) {
  const t = await json<{ access_token: string; refresh_token?: string; expires_in: number }>(await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: settings.googleClientId, client_secret: settings.googleClientSecret, redirect_uri: callbackUrl("youtube"), grant_type: "authorization_code" }) }), "Google sign-in");
  const ch = await json<{ items?: { id: string; snippet?: { title?: string } }[] }>(await f("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${t.access_token}` } }), "YouTube channel");
  const c = ch.items?.[0];
  if (!c) throw new AppError("This Google account has no YouTube channel. Create one on YouTube first.", { code: "SOCIAL_NO_CHANNEL", status: 422 });
  return { remoteId: c.id, name: c.snippet?.title || "YouTube channel", access: seal(t.access_token), refresh: t.refresh_token ? seal(t.refresh_token) : undefined, expiresAt: Date.now() + t.expires_in * 1000 };
}
async function instagramTokens(code: string, f: Fetch) {
  const short = await json<{ access_token: string; user_id: string | number }>(await f("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: settings.instagramAppId, client_secret: settings.instagramAppSecret, grant_type: "authorization_code", redirect_uri: callbackUrl("instagram"), code }) }), "Instagram sign-in");
  const long = await json<{ access_token: string; expires_in: number }>(await f(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: settings.instagramAppSecret, access_token: short.access_token })}`), "Instagram token");
  const me = await json<{ user_id?: string; id?: string; username?: string }>(await f(`${IG_API}/me?${new URLSearchParams({ fields: "user_id,username", access_token: long.access_token })}`), "Instagram account");
  return { remoteId: String(me.user_id ?? me.id ?? short.user_id), name: me.username ? `@${me.username}` : "Instagram", access: seal(long.access_token), expiresAt: Date.now() + long.expires_in * 1000 };
}

/** A working access token: YouTube's refreshed when it is about to end, Instagram's long-lived one renewed when under 10 days. */
async function tokenFor(a: AccountDoc, f: Fetch): Promise<string> {
  const col = await accounts();
  if (a.platform === "youtube" && a.expiresAt - Date.now() < 120_000) {
    if (!a.refresh) throw new AppError("YouTube needs to be connected again.", { code: "SOCIAL_RECONNECT", status: 401 });
    const t = await json<{ access_token: string; expires_in: number }>(await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: settings.googleClientId, client_secret: settings.googleClientSecret, refresh_token: open(a.refresh), grant_type: "refresh_token" }) }), "YouTube sign-in");
    a.access = seal(t.access_token); a.expiresAt = Date.now() + t.expires_in * 1000;
    await col.updateOne({ _id: a._id }, { $set: { access: a.access, expiresAt: a.expiresAt } });
  } else if (a.platform === "instagram") {
    if (a.expiresAt < Date.now()) throw new AppError("Instagram needs to be connected again.", { code: "SOCIAL_RECONNECT", status: 401 });
    if (a.expiresAt - Date.now() < 10 * 86_400_000) {
      const t = await json<{ access_token: string; expires_in: number }>(await f(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: open(a.access) })}`), "Instagram token");
      a.access = seal(t.access_token); a.expiresAt = Date.now() + t.expires_in * 1000;
      await col.updateOne({ _id: a._id }, { $set: { access: a.access, expiresAt: a.expiresAt } });
    }
  }
  return open(a.access);
}

export async function disconnect(p: Platform) { await (await accounts()).deleteMany({ platform: p }); return { ok: true }; }

const postOut = (d: PostDoc) => ({ id: String(d._id), platform: d.platform, reelId: d.reelId, reelName: d.reelName, caption: d.caption, title: d.title, at: d.at.toISOString(),
  status: d.status, step: d.step ?? "", url: d.url ?? "", error: d.error ?? "", stats: d.stats ?? null });

/** What the person sees: the platforms (connected or not) and their posts, newest first. Asking moves due posts on. */
export async function overview(f: Fetch = fetch) {
  const accs = await (await accounts()).find({}).toArray();
  await advanceMine(f);
  const list = await (await posts()).find({}).sort({ createdAt: -1 }).limit(100).toArray();
  return {
    platforms: PLATFORMS.map((p) => { const a = accs.find((x) => x.platform === p); return { id: p, ready: ready(p), connected: !!a, name: a?.name ?? "", needsReconnect: !!a && p === "instagram" && a.expiresAt < Date.now() }; }),
    posts: list.map(postOut),
  };
}

// ------------------------------------------------------------------ posting
export const PostIn = z.object({
  reelId: z.string().min(12).max(40),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(2),
  caption: z.string().max(2200).default(""),
  title: z.string().max(100).default(""),
  at: z.string().datetime().nullable().default(null),
});
interface ReelRow { _id: ObjectId; name: string; key: string; size: number; type: string; dur?: number; status: string }

export async function createPosts(p: z.infer<typeof PostIn>, f: Fetch = fetch) {
  const reel = await (await db()).collection<ReelRow>("studio_reels").findOne({ _id: parseId(p.reelId, "Reel"), status: "ready" });
  if (!reel) throw new NotFoundError("This Reel is no longer in My Reels.", { code: "REEL_NOT_FOUND" });
  const accs = await (await accounts()).find({ platform: { $in: p.platforms } }).toArray();
  for (const pl of p.platforms) if (!accs.some((a) => a.platform === pl)) throw new ValidationFailed(`Connect ${pl === "youtube" ? "YouTube" : "Instagram"} first.`, { code: "SOCIAL_NOT_CONNECTED" });
  if (p.platforms.includes("instagram") && !r2Config()) throw new ValidationFailed("Instagram needs the Reel in cloud storage (R2), which this server does not have.", { code: "SOCIAL_NO_R2" });
  if (p.platforms.includes("instagram") && reel.dur && (reel.dur < 3 || reel.dur > 900)) throw new ValidationFailed("Instagram takes Reels from 3 seconds to 15 minutes.", { code: "SOCIAL_IG_LENGTH" });
  const at = p.at ? new Date(p.at) : new Date();
  if (at.getTime() > Date.now() + 180 * 86_400_000) throw new ValidationFailed("Choose a time within the next 6 months.", { code: "SOCIAL_TOO_LATE" });
  const col = await posts(), now = new Date();
  const docs: PostDoc[] = p.platforms.map((pl) => ({ _id: new ObjectId(), platform: pl, reelId: String(reel._id), reelName: reel.name, caption: p.caption.trim(), title: (p.title.trim() || reel.name).slice(0, 100),
    at: at < now ? now : at, status: "scheduled", tries: 0, createdAt: now }));
  await col.insertMany(docs);
  await advanceMine(f);
  return { posts: (await col.find({ _id: { $in: docs.map((d) => d._id) } }).toArray()).map(postOut) };
}

export async function cancelPost(id: string) {
  const r = await (await posts()).updateOne({ _id: parseId(id, "Post"), status: "scheduled", step: { $exists: false } }, { $set: { status: "cancelled" } });
  if (!r.modifiedCount) throw new ValidationFailed("This post has already started and cannot be cancelled here.", { code: "SOCIAL_STARTED" });
  return { ok: true };
}

/** One short step for each of this person's due posts, started in the background (each post locked while it works). */
async function advanceMine(f: Fetch, wait = false) {
  const work: Promise<unknown>[] = [];
  const col = await posts(), now = Date.now();
  // YouTube: its own schedule waits (publishAt), so a scheduled Short is uploaded now; Instagram waits for its time
  const due = await col.find({ status: { $in: ["scheduled", "working"] }, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }] }).limit(5).toArray();
  for (const d of due) {
    if (d.platform === "instagram" && d.at.getTime() > now && !d.step) continue;
    const got = await col.updateOne({ _id: d._id, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }] }, { $set: { lockedUntil: now + 10 * 60_000 } });
    if (!got.modifiedCount) continue;
    const uid = currentUser();
    work.push(withUser(uid, () => step(d, f)).catch((e) => console.warn("social step:", (e as Error).message)));
  }
  // views and likes, at most every 30 minutes per post, a few per visit
  const stale = await col.find({ status: "published", $or: [{ "stats.at": { $exists: false } }, { "stats.at": { $lt: now - 30 * 60_000 } }] }).limit(3).toArray();
  for (const d of stale) work.push(withUser(currentUser(), () => refreshStats(d, f)).catch(() => {}));
  if (wait) await Promise.all(work); // a scheduler's call waits (nobody keeps the server awake after it)
}

/** Every scheduled post of every account (a scheduler's call, /api/cron/social). */
export async function advanceAll(f: Fetch = fetch) {
  const owners = await (await mainDb()).collection<PostDoc>("social_posts").distinct(OWNER, { status: { $in: ["scheduled", "working"] }, at: { $lte: new Date() } });
  for (const o of owners.slice(0, 200)) await withUser(String(o), () => advanceMine(f, true));
  return { owners: owners.length };
}

async function save(d: PostDoc, set: Partial<PostDoc>, unlock = true) {
  Object.assign(d, set);
  await (await posts()).updateOne({ _id: d._id }, { $set: set, ...(unlock ? { $unset: { lockedUntil: "" } } : {}) });
}

const reelStream = async (r: ReelRow): Promise<ReadableStream<Uint8Array>> => {
  const c = r2Config();
  if (c) { const res = await fetch(objectUrl(c, r.key, 3600)); if (!res.ok || !res.body) throw new Error(`the Reel's file could not be read (${res.status})`); return res.body; }
  return Readable.toWeb(fs.createReadStream(localPath(r.key))) as unknown as ReadableStream<Uint8Array>;
};

/** One step of one post; any failure is kept on the post (three tries for passing troubles). */
export async function step(d: PostDoc, f: Fetch = fetch) {
  try {
    const a = await (await accounts()).findOne({ platform: d.platform });
    if (!a) throw new AppError(`${d.platform === "youtube" ? "YouTube" : "Instagram"} is not connected any more. Connect it again.`, { code: "SOCIAL_RECONNECT", status: 401 });
    const reel = await (await db()).collection<ReelRow>("studio_reels").findOne({ _id: new ObjectId(d.reelId), status: "ready" });
    if (!reel) throw new AppError("The Reel was deleted from My Reels.", { code: "REEL_NOT_FOUND", status: 404 });
    const token = await tokenFor(a, f);
    if (d.platform === "youtube") await youtubeStep(d, a, reel, token, f);
    else await instagramStep(d, a, reel, token, f);
  } catch (e) {
    const err = e as AppError & { status?: number }, permanent = err.status === 401 || err.status === 404 || err.status === 422 || d.tries >= 2;
    await save(d, permanent ? { status: "failed", error: String(err.message).slice(0, 300), tries: d.tries + 1 } : { status: "working", error: String(err.message).slice(0, 300), tries: d.tries + 1 });
  }
}

async function youtubeStep(d: PostDoc, _a: AccountDoc, reel: ReelRow, token: string, f: Fetch) {
  await save(d, { status: "working", step: "uploading" }, false);
  const scheduled = d.at.getTime() > Date.now() + 60_000;
  const tags = [...new Set((d.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1)))].slice(0, 15);
  const meta = { snippet: { title: /#shorts/i.test(d.title) ? d.title : `${d.title} #Shorts`.slice(0, 100), description: d.caption, tags, categoryId: "22" },
    status: { privacyStatus: scheduled ? "private" : "public", ...(scheduled ? { publishAt: d.at.toISOString() } : {}), selfDeclaredMadeForKids: false } };
  const start = await f("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": reel.type || "video/mp4", "X-Upload-Content-Length": String(reel.size) }, body: JSON.stringify(meta) });
  if (!start.ok) await json(start, "YouTube upload");
  const at = start.headers.get("location");
  if (!at) throw new Error("YouTube gave no upload address");
  const put = await f(at, { method: "PUT", headers: { "Content-Type": reel.type || "video/mp4", "Content-Length": String(reel.size) }, body: await reelStream(reel), duplex: "half" } as RequestInit);
  const v = await json<{ id: string }>(put, "YouTube upload");
  await save(d, { status: "published", step: scheduled ? "scheduled on YouTube" : "", remoteId: v.id, url: `https://youtube.com/shorts/${v.id}`, error: "" });
}

async function instagramStep(d: PostDoc, a: AccountDoc, reel: ReelRow, token: string, f: Fetch) {
  const c = r2Config();
  if (!c) throw new AppError("Instagram needs the Reel in cloud storage (R2).", { code: "SOCIAL_NO_R2", status: 422 });
  if (!d.container) {
    const r = await json<{ id: string }>(await f(`${IG_API}/${a.remoteId}/media`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "REELS", video_url: objectUrl(c, reel.key, 2 * 3600), caption: d.caption, share_to_feed: "true", access_token: token }) }), "Instagram upload");
    await save(d, { status: "working", step: "Instagram is processing the video", container: r.id, error: "" }, false);
  }
  // Instagram reads the video in its own time: ask (a few times in this step), and leave it for the next step if not ready
  for (let i = 0; i < 5; i++) {
    const s = await json<{ status_code?: string; status?: string }>(await f(`${IG_API}/${d.container}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`), "Instagram status");
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new AppError(`Instagram could not use this video (${s.status ?? s.status_code}). Reels must be MP4 (H.264 + AAC), 3 s to 15 min.`, { code: "SOCIAL_IG_VIDEO", status: 422 });
    if (s.status_code === "FINISHED") {
      const pub = await json<{ id: string }>(await f(`${IG_API}/${a.remoteId}/media_publish`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ creation_id: d.container!, access_token: token }) }), "Instagram publish");
      let url = "";
      try { url = (await json<{ permalink?: string }>(await f(`${IG_API}/${pub.id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`), "Instagram link")).permalink ?? ""; } catch { /* the post is up */ }
      await save(d, { status: "published", step: "", remoteId: pub.id, url, error: "" });
      return;
    }
    await new Promise((ok) => setTimeout(ok, 4000));
  }
  await save(d, { status: "working", step: "Instagram is processing the video" }); // unlocked: the next ask goes on
}

async function refreshStats(d: PostDoc, f: Fetch) {
  const a = await (await accounts()).findOne({ platform: d.platform });
  if (!a || !d.remoteId) return;
  const token = await tokenFor(a, f), now = Date.now();
  if (d.platform === "youtube") {
    const r = await json<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(await f(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${d.remoteId}`, { headers: { Authorization: `Bearer ${token}` } }), "YouTube stats");
    const s = r.items?.[0]?.statistics;
    await save(d, { stats: { views: Number(s?.viewCount ?? 0), likes: Number(s?.likeCount ?? 0), comments: Number(s?.commentCount ?? 0), at: now } }, false);
  } else {
    const m = await json<{ like_count?: number; comments_count?: number }>(await f(`${IG_API}/${d.remoteId}?${new URLSearchParams({ fields: "like_count,comments_count", access_token: token })}`), "Instagram stats");
    let views: number | undefined;
    try {
      const ins = await json<{ data?: { name: string; values?: { value: number }[] }[] }>(await f(`${IG_API}/${d.remoteId}/insights?${new URLSearchParams({ metric: "views", access_token: token })}`), "Instagram insights");
      views = ins.data?.find((x) => x.name === "views")?.values?.[0]?.value;
    } catch { /* insights need the permission; likes and comments are enough */ }
    await save(d, { stats: { views, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, at: now } }, false);
  }
}

// ------------------------------------------------------------------ Shubix AI writes the caption
export const CaptionIn = z.object({ about: z.string().trim().min(3).max(1500), language: z.string().max(30).default("the same language as the description"), platform: z.enum(PLATFORMS).default("instagram") });
const Caption = z.object({ title: z.string().max(100), caption: z.string().max(2000), hashtags: z.array(z.string().max(40)).max(15) });
export async function writeCaption(p: z.infer<typeof CaptionIn>) {
  const c = await chargeOnce("studio_chat_small", crypto.randomUUID(), "Caption for a post");
  try {
    const out = await getProvider("general").structured(
      "You write captions for short vertical videos on Instagram Reels and YouTube Shorts for Indian creators. A strong first line (the hook), 1-3 short lines, one call to action, no made-up facts. Hashtags: 5-12, mixing broad and niche, no spaces, without the # sign.",
      `Video: ${p.about}\nLanguage: ${p.language}\nPlatform: ${p.platform}`, Caption, { temperature: 0.7, maxOutputTokens: 800 });
    const tags = out.hashtags.map((t) => t.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean);
    return { title: out.title.slice(0, 100), caption: `${out.caption.trim()}\n\n${tags.map((t) => `#${t}`).join(" ")}`.slice(0, 2200), charged: c.taken };
  } catch (e) {
    if (c.taken) await refund(c.ref);
    throw e;
  }
}
