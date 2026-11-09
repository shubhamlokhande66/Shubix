import { safeNext } from "@shubix/core/lib/access";

/** Generate Reel needs an account, free or paid. Nobody is signed in, or it cannot be checked (offline, the server
 * asleep or down): sign in first. Only a studio with accounts switched off (a single-person install) goes on. */
export async function needsSignIn(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "same-origin", headers: { Accept: "application/json" } });
    const me = r.ok ? ((await r.json()) as { authEnabled?: boolean; user?: unknown }) : null;
    return !me || (me.authEnabled !== false && !me.user);
  } catch { return true; }
}

/** The page to return to after signing in (the studio with its Reel kept, a page that needed an account). It waits in
 * this tab through the sign-in, the email code and Google, then is used once. */
const KEY = "shubix-next";
export function keepNext(next: string | null) {
  if (!next) return;
  try { sessionStorage.setItem(KEY, safeNext(next)); } catch { /* private mode: Home after signing in */ }
}
export function takeNext(): string {
  let next = "/";
  try { next = safeNext(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  return next;
}
/** Sign in, then back here: the studio saves its Reel first and passes its own address. */
export function signInThen(next: string) {
  keepNext(next);
  window.location.assign(`/login?next=${encodeURIComponent(safeNext(next))}`);
}
