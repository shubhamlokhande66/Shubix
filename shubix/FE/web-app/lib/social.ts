/** Publish to Instagram and YouTube (BE/api/src/server/social.ts): the platforms, the posts, posting, and Shubix AI's caption. */

export type Platform = "youtube" | "instagram";
export type SocialPlatform = { id: Platform; ready: boolean; connected: boolean; name: string; needsReconnect: boolean };
export type SocialPost = { id: string; platform: Platform; reelId: string; reelName: string; caption: string; title: string; at: string; status: "scheduled" | "working" | "published" | "failed" | "cancelled"; step: string; url: string; error: string; stats: { views?: number; likes?: number; comments?: number } | null };
export const PLATFORM_NAME: Record<Platform, string> = { youtube: "YouTube Shorts", instagram: "Instagram Reels" };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try { r = await fetch(path, { ...init, credentials: "include", headers: init.body ? { "Content-Type": "application/json" } : undefined }); }
  catch { throw new Error("No connection. Check your internet and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `That did not work (${r.status}). Please try again.`), { status: r.status, code: j?.error?.code });
  return j as T;
}

export const getSocial = () => call<{ platforms: SocialPlatform[]; posts: SocialPost[] }>("/api/social");
export const publish = (p: { reelId: string; platforms: Platform[]; caption: string; title: string; at: string | null }) => call<{ posts: SocialPost[] }>("/api/social/posts", { method: "POST", body: JSON.stringify(p) });
export const cancelPost = (id: string) => call<{ ok: true }>(`/api/social/posts/${id}`, { method: "DELETE" });
export const disconnect = (p: Platform) => call<{ ok: true }>(`/api/social/${p}`, { method: "DELETE" });
export const writeCaption = (about: string, platform: Platform) => call<{ title: string; caption: string; charged: number }>("/api/social/caption", { method: "POST", body: JSON.stringify({ about, platform }) });
/** the platform's sign-in (a full page: it comes back to My Reels) */
export const connectUrl = (p: Platform) => `/api/social/${p}/connect`;
