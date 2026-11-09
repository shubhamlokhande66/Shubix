import crypto from "node:crypto";
import { safeNext } from "@shubix/core/lib/access";
import { googleAccount } from "./accounts";
import { getAccess } from "./core/access";
import { settings } from "./core/config";
import { AppError } from "./core/errors";

/** "Continue with Google" for the website (OAuth 2.0 code flow, run by the server). The browser leaves for Google and
 * comes back to /api/auth/google/callback; the page it was on (`next`) and a friend's invite (`ref`) wait in a short
 * cookie, with a random `state` that the answer must carry. The ID token comes straight from Google's token endpoint over
 * HTTPS, so its claims are checked, not its signature (Google's own guidance for this flow). */

const COOKIE = "g_oauth", PATH = "/api/auth/google";
const base = () => (settings.publicBaseUrl || "http://localhost:3000").replace(/\/+$/, "");
export const redirectUri = () => `${base()}${PATH}/callback`;
const go = (to: string, cookie?: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const cookieOf = (req: Request) => /(?:^|;\s*)g_oauth=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1] ?? "";
const pack = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const unpack = (s: string) => { try { return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as { n?: string; r?: string }; } catch { return {}; } };
const setCookie = (v: string, age: number) => `${COOKIE}=${v}; Max-Age=${age}; Path=${PATH}; HttpOnly; SameSite=Lax${settings.cookieSecure ? "; Secure" : ""}`;
/** back to the sign-in page, with the reason and the page to return to */
const failed = (next: string, why: string) => go(`${base()}/login?error=${encodeURIComponent(why)}&next=${encodeURIComponent(next)}`, setCookie("", 0));

export async function start(req: Request) {
  const a = await getAccess();
  if (!settings.authEnabled || !a.googleReady || !a.google) throw new AppError("Google sign-in is not switched on.", { code: "GOOGLE_OFF", status: 404 });
  const q = new URL(req.url).searchParams, state = crypto.randomBytes(18).toString("base64url");
  const next = safeNext(q.get("next")), ref = (q.get("ref") ?? "").replace(/[^\w-]/g, "").slice(0, 40);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: settings.googleClientId, redirect_uri: redirectUri(), response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  return go(url.toString(), setCookie(`${state}.${pack({ n: next, r: ref })}`, 600));
}

type Claims = { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean | string; sub?: string; name?: string };
/** the ID token's claims, checked: for this app, from Google, not expired, a proved email */
export function claimsOk(c: Claims, clientId: string, now = Date.now() / 1000) {
  return ["accounts.google.com", "https://accounts.google.com"].includes(c.iss ?? "") && c.aud === clientId && (c.exp ?? 0) > now
    && !!c.email && !!c.sub && (c.email_verified === true || c.email_verified === "true");
}

export async function callback(req: Request, fetcher: typeof fetch = fetch) {
  const q = new URL(req.url).searchParams, [state, packed = ""] = cookieOf(req).split(".");
  const saved = unpack(packed), next = safeNext(saved.n);
  if (!state || q.get("state") !== state) return failed(next, "google_state");
  if (q.get("error") || !q.get("code")) return failed(next, "google_cancelled");
  try {
    const r = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: q.get("code")!, client_id: settings.googleClientId, client_secret: settings.googleClientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }) });
    const token = ((await r.json()) as { id_token?: string }).id_token ?? "";
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as Claims;
    if (!r.ok || !claimsOk(claims, settings.googleClientId)) return failed(next, "google_failed");
    const session = await googleAccount({ email: claims.email!, sub: claims.sub!, name: claims.name }, saved.r);
    const res = go(`${base()}${next}`, session);
    res.headers.append("Set-Cookie", setCookie("", 0));
    return res;
  } catch (e) {
    console.warn("google sign-in:", (e as Error).message);
    return failed(next, "google_failed");
  }
}
