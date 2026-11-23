/** How many actions (non-GET requests and uploads) are on their way to the server right now; the GlobalActivity bar
 * shows while this is above zero, so every click that does something gives visible feedback.
 * The button that started an action shows a spinner inside it until the action is done: the last button clicked (a
 * moment ago) gets aria-busy="true" while its requests run (styled in app/globals.css), with no code in each page. */
let count = 0;
const listeners = new Set<() => void>();
const CLICK_MS = 1500;
let lastClick: { el: HTMLElement; at: number } | null = null;
const busy = new Map<HTMLElement, number>();

if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("button, [role=button], a.btn");
      lastClick = el instanceof HTMLElement ? { el, at: Date.now() } : null;
    },
    true,
  );
}

/* A button that opens another page (<Button href>): a spinner in it from the tap until the page is there (a full load, or a
 * page whose code is still coming, gave no sign of the tap). */
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[data-btn]");
    if (!(a instanceof HTMLAnchorElement) || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.origin !== location.origin) return;
    if (a.pathname === location.pathname && a.search === location.search) return;
    const from = location.href, t0 = Date.now();
    a.setAttribute("aria-busy", "true");
    const end = () => { clearInterval(t); window.removeEventListener("pageshow", end); a.removeAttribute("aria-busy"); };
    // the new page is there (the address changed), it did not open, or Back brought this page as it was
    const t = setInterval(() => { if (location.href !== from || !a.isConnected || Date.now() - t0 > 15_000) end(); }, 150);
    window.addEventListener("pageshow", end);
  });
}

function claimButton(): HTMLElement | null {
  const c = lastClick;
  if (!c || Date.now() - c.at > CLICK_MS || !c.el.isConnected) return null;
  busy.set(c.el, (busy.get(c.el) ?? 0) + 1);
  c.el.setAttribute("aria-busy", "true");
  return c.el;
}
function releaseButton(el: HTMLElement | null) {
  if (!el) return;
  const n = (busy.get(el) ?? 1) - 1;
  if (n > 0) return void busy.set(el, n);
  busy.delete(el);
  el.removeAttribute("aria-busy");
}

export function subscribeActivity(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function activityCount() {
  return count;
}

/** a read started by a click: the button that was clicked is busy (spinner, no second click) while it runs; the
 * activity bar is for actions only (reads also happen in the background) */
export async function clickBusy<T>(work: Promise<T>): Promise<T> {
  const button = claimButton();
  try { return await work; } finally { releaseButton(button); }
}

export async function tracked<T>(work: Promise<T>): Promise<T> {
  count += 1;
  const button = claimButton();
  listeners.forEach((fn) => fn());
  try {
    return await work;
  } finally {
    count -= 1;
    releaseButton(button);
    listeners.forEach((fn) => fn());
  }
}
