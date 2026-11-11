import { api } from "./api";
import type { Credits } from "@/types/api";

/** Cashfree Payment Gateway: the server creates the order (its own price), Cashfree takes the payment in its own window
 * (UPI, cards, net banking, wallets; no card details ever touch this app), and the server asks Cashfree whether the order
 * is paid before anything is given. Its look (name, logo, colour) is set on merchant.cashfree.com. */

type CashfreeResult = { error?: { message?: string }; redirect?: boolean; paymentDetails?: unknown };
type CashfreeCtor = (o: { mode: "sandbox" | "production" }) => { checkout: (o: { paymentSessionId: string; redirectTarget: "_modal" | HTMLElement }) => Promise<CashfreeResult> };

const SCRIPT = "https://sdk.cashfree.com/js/v3/cashfree.js";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && (window as unknown as { Cashfree?: CashfreeCtor }).Cashfree) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("The payment window could not be loaded. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  return loading;
}

export type PayResult = { status: "paid"; credits: Credits } | { status: "closed" } | { status: "failed"; message: string };

/** Our own payment window, Cashfree's checkout shown inside it (inline): Cashfree's own pop-up has no way out on some of
 * its screens (its "Broken Link" page, 2026-11-11), ours always has its X (and Escape). `closed` resolves when the person
 * closes it; `remove` takes it away. */
function paymentWindow() {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => Object.assign(document.createElement(tag), { className });
  const overlay = el("div", "fixed inset-0 z-[100] grid place-items-center bg-[var(--overlay)] backdrop-blur-[2px] sm:p-4");
  const panel = el("div", "flex h-full w-full animate-pop flex-col overflow-hidden bg-surface shadow-2xl sm:h-[min(720px,92vh)] sm:max-w-[480px] sm:rounded-2xl sm:border sm:border-border");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Payment");
  const head = el("div", "flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]");
  const title = el("b", "text-[15px]");
  title.textContent = "Secure payment";
  const x = el("button", "grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground");
  x.type = "button";
  x.setAttribute("aria-label", "Close payment");
  x.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const box = el("div", "min-h-0 flex-1 overflow-auto bg-white");
  head.append(title, x);
  panel.append(head, box);
  overlay.append(panel);
  const scroll = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.append(overlay);
  x.focus();
  let onKey: (e: KeyboardEvent) => void = () => {};
  const closed = new Promise<void>((resolve) => {
    x.onclick = () => resolve();
    onKey = (e) => { if (e.key === "Escape") resolve(); };
    window.addEventListener("keydown", onKey);
  });
  const remove = () => { window.removeEventListener("keydown", onKey); overlay.remove(); document.body.style.overflow = scroll; };
  return { box, closed, remove };
}

/** Pay for "plan:creator:monthly", "plan:pro:yearly", "topup:topup_30" ... with the mobile number Cashfree needs (kept on
 * the account after the first payment). Resolves when the window closes. */
export async function pay(item: string, coupon?: string, phone?: string): Promise<PayResult> {
  const [order] = await Promise.all([api.createOrder(item, coupon, phone), loadScript()]); // the server prices it (offer, coupon)
  const Cashfree = (window as unknown as { Cashfree: CashfreeCtor }).Cashfree;
  const win = paymentWindow();
  let r: CashfreeResult;
  try {
    r = await Promise.race([
      Cashfree({ mode: order.mode }).checkout({ paymentSessionId: order.sessionId, redirectTarget: win.box }),
      win.closed.then((): CashfreeResult => ({ error: { message: "closed" } })), // our X: Cashfree is asked below all the same
    ]);
  } catch (e) {
    win.remove();
    throw e;
  }
  // a phone's in-app browser that cannot show the window: Cashfree takes over the page and comes back to /pricing?order=…
  if (r.redirect) return new Promise<PayResult>(() => {});
  win.remove();
  // closed or finished, paid or not: Cashfree itself is asked (money taken just before a close still counts)
  try {
    return { status: "paid", credits: await api.verifyPayment(order.orderId) };
  } catch (e) {
    if (r.paymentDetails) return { status: "failed", message: e instanceof Error ? e.message : "The payment could not be verified." };
    return r.error?.message && !/clos|cancel/i.test(r.error.message) ? { status: "failed", message: r.error.message } : { status: "closed" };
  }
}

/** Back from Cashfree's own page (/pricing?order=…): whether that order is paid. */
export async function paidOrder(orderId: string): Promise<PayResult> {
  try {
    return { status: "paid", credits: await api.verifyPayment(orderId) };
  } catch (e) {
    return { status: "failed", message: e instanceof Error ? e.message : "The payment could not be verified." };
  }
}
