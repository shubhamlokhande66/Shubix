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

/** Generate Reel with nobody signed in: sign in in a small window (a tab on a phone) that closes itself after, this one stays as it is. Leaving the studio meant saving every
 * clip into the browser's storage first and loading it all again after, which ran an iPhone out of memory (Safari then
 * reloads the page). A popup says so; when the other tab has signed in (checked when this tab is seen again, and every 3 s)
 * it closes and `onDone` goes on with the Reel. Close: nothing happens. */
/** direct: the sign-in window opens at once (call it inside the click); this screen only says it waits, with Cancel. */
export function signInBeside(onDone: () => void, direct = false) {
  if (document.getElementById("signin-beside")) return;
  const box = document.createElement("div");
  box.id = "signin-beside"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
  box.className = "fixed inset-0 z-[1000] grid place-items-center bg-black/60 p-4";
  box.innerHTML = `<div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 text-foreground shadow-xl">
    <h2 class="text-lg font-bold">Sign in to make your Reel</h2>
    <p class="mt-2 text-sm text-muted">Your Reel stays right here. Sign in, and you come back to this screen and Shubix makes it.</p>
    <div class="mt-4 flex gap-2"><a id="signin-beside-go" class="flex-1 rounded-xl bg-accent px-4 py-2.5 text-center font-semibold text-on-accent" target="_blank" rel="opener" href="/login?next=%2Fsigned-in">Sign in</a>
    <button type="button" class="flex-1 rounded-xl border border-border px-4 py-2.5 font-semibold">Close</button></div></div>`;
  let busy = false;
  const stop = () => { clearInterval(t); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); box.remove(); };
  const check = async () => { if (busy || document.hidden) return; busy = true; try { if (!(await needsSignIn())) { stop(); onDone(); } } finally { busy = false; } };
  const t = setInterval(check, 3000);
  window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
  box.querySelector("button")!.addEventListener("click", stop);
  // a small sign-in window over this one (a tab on a phone): when it is done it closes itself (/signed-in) and this
  // screen goes on. A browser that blocks it follows the link (a new tab) as before.
  box.querySelector<HTMLAnchorElement>("#signin-beside-go")!.addEventListener("click", (e) => {
    const wide = window.innerWidth >= 700, w = 480, h = 720;
    const feat = wide ? `popup,width=${w},height=${h},left=${Math.round(window.screenX + (window.outerWidth - w) / 2)},top=${Math.round(window.screenY + (window.outerHeight - h) / 2)}` : "";
    const win = window.open("/login?next=%2Fsigned-in", "shubix-signin", feat);
    if (win) e.preventDefault();
  });
  if (direct) {
    const wide = window.innerWidth >= 700, w = 480, h = 720;
    const feat = wide ? `popup,width=${w},height=${h},left=${Math.round(window.screenX + (window.outerWidth - w) / 2)},top=${Math.round(window.screenY + (window.outerHeight - h) / 2)}` : "";
    const win = window.open("/login?next=%2Fsigned-in", "shubix-signin", feat);
    if (win) {   // opened: no question here, only what is happening (and Cancel)
      box.querySelector("h2")!.textContent = "Signing in…";
      box.querySelector("p")!.textContent = "Finish signing in, and Shubix makes your Reel right here. Your clips stay as they are.";
      const go = box.querySelector<HTMLAnchorElement>("#signin-beside-go")!; go.textContent = "Open sign-in again";
      box.querySelector("button")!.textContent = "Cancel";
    }
  }
  document.body.appendChild(box);
}
