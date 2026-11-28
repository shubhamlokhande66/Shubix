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
  try { next = safeNext(sessionStorage.getItem(KEY) ?? sessionStorage.getItem(LAST)); sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  return next;
}
/** The page last seen in this tab (the app shell notes each one; never a sign-in page): where signing in goes back to when
 * no page was asked for. A page opened after an older sign-in was left: that one is not waited for any more. */
const LAST = "shubix-last";
export function noteLast(page: string) {
  try { sessionStorage.setItem(LAST, safeNext(page)); sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}
export function lastPage(): string {
  try { return safeNext(sessionStorage.getItem(LAST)); } catch { return "/"; }
}
/** Signed out: the same page, loaded whole (nothing of the account stays in the page). A page open to everyone stays
 * (the studio, Pricing…); a page that needs an account goes to the sign-in page, then back to it (the app shell does
 * that for a page loaded without an account). Before 2026-11-28 it was always Home. */
export function afterSignOut() {
  try { localStorage.removeItem("brs-plan"); } catch { /* private mode */ }   // the plan the studio remembers is that account's
  window.location.assign(safeNext(window.location.pathname + window.location.search));
}
/** Sign in, then back here: the studio saves its Reel first and passes its own address. */
export function signInThen(next: string) {
  keepNext(next);
  window.location.assign(`/login?next=${encodeURIComponent(safeNext(next))}`);
}

/** Generate Reel with nobody signed in: the sign-in popup opens over this page (components/organisms/SignInDialog, in the
 * app shell); signed in, it closes and `onDone` goes on with the Reel. Nothing is left, saved or loaded again (leaving the
 * studio ran an iPhone out of memory). Close: nothing happens. */
export const SIGN_IN = "shubix-sign-in";
export function signInHere(onDone: () => void) {
  const e = new CustomEvent(SIGN_IN, { detail: { onDone }, cancelable: true });
  window.dispatchEvent(e);
  // no popup on this page (it is always in the app shell): the sign-in page, then back here
  if (!e.defaultPrevented) signInThen(window.location.pathname + window.location.search);
}
