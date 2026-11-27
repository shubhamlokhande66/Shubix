import { savedRef } from "@/lib/marketing";
import { needsSignIn } from "@/lib/returnTo";

/** Google's account chooser in a popup window (it refuses to be shown inside another page; a phone opens it as a tab). The
 * window starts on our own /signed-in?google=1, which wakes the server, goes on to Google and comes back to /signed-in,
 * which says so here and closes itself. False: the browser did not open it. Call it inside the click. */
const NAME = "shubix-signin", CHANNEL = "shubix-signin";
export const googleUrl = (next: string) => `/api/auth/google?next=${encodeURIComponent(next)}&ref=${encodeURIComponent(savedRef() ?? "")}`;

export function openGoogle(): boolean {
  if (window.name === NAME) return false;   // this is that window already (Google failed, it shows the sign-in page): go on in it
  const w = 480, h = 720, wide = window.innerWidth >= 700;
  const feat = wide ? `popup,width=${w},height=${h},left=${Math.round(window.screenX + (window.outerWidth - w) / 2)},top=${Math.round(window.screenY + (window.outerHeight - h) / 2)}` : "";
  return !!window.open("/signed-in?google=1", NAME, feat);
}

/** /signed-in: tell the page that opened this window */
export function tellSignedIn() {
  try { const c = new BroadcastChannel(CHANNEL); c.postMessage("in"); c.close(); } catch { /* an old browser: the page looks by itself */ }
}

/** Until stopped, looks whether the sign-in beside this page is done (told by the window, when this page is seen again, and
 * with `poll` every 3 s), then calls `done` once. */
export function watchSignIn(done: () => void, poll: boolean): () => void {
  let busy = false, over = false;
  // with `poll` (Google's page open) it asks even while this page is hidden: a phone opens Google as a tab over this one,
  // and these questions keep the API awake (it sleeps 30 s after the last request). Choosing an account took longer, so
  // Google came back to a sleeping server: a long wait, an error, then a second try worked (2026-11-27)
  const check = async (told = false) => {
    if (busy || over || (document.hidden && !told && !poll)) return;
    busy = true;
    try { if (!(await needsSignIn()) && !over) { over = true; done(); } } finally { busy = false; }
  };
  const seen = () => void check();
  const shown = () => { if (!document.hidden) void check(true); };   // seen again: asked whatever the time
  let c: BroadcastChannel | null = null;
  try { c = new BroadcastChannel(CHANNEL); c.onmessage = () => void check(true); } catch { /* old browser */ }
  // (for 10 minutes at most: a Google tab left open does not keep the server awake for ever; after that, on being seen again)
  const until = Date.now() + 10 * 60_000;
  const t = poll ? setInterval(() => { if (Date.now() > until) { clearInterval(t); return; } seen(); }, 3000) : undefined;
  window.addEventListener("focus", shown);
  document.addEventListener("visibilitychange", shown);
  return () => { over = true; c?.close(); clearInterval(t); window.removeEventListener("focus", shown); document.removeEventListener("visibilitychange", shown); };
}
