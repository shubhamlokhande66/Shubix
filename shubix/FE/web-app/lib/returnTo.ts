import { DEFAULT_ACCESS, safeNext, type StudioAsk } from "@shubix/core/lib/access";

/** The studio, at this moment (Generate or Export): nobody is signed in and the administrator wants an account now.
 * Unsure (offline): no, the studio goes on and the server still asks when it must. */
export async function needsSignIn(moment: StudioAsk): Promise<boolean> {
  try {
    const read = (p: string) => fetch(p, { credentials: "same-origin", headers: { Accept: "application/json" } }).then((r) => r.json());
    const [me, a] = await Promise.all([read("/api/auth/me"), read("/api/access").catch(() => DEFAULT_ACCESS)]);
    return !!me?.authEnabled && !me.user && (a?.studioAsk ?? DEFAULT_ACCESS.studioAsk) === moment;
  } catch { return false; }
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
