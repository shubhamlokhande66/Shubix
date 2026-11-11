import { api } from "./api";
import type { Credits } from "@/types/api";

/** Cashfree Payment Gateway: the server creates the order (its own price), Cashfree takes the payment in its own window
 * (UPI, cards, net banking, wallets; no card details ever touch this app), and the server asks Cashfree whether the order
 * is paid before anything is given. Its look (name, logo, colour) is set on merchant.cashfree.com. */

type CashfreeResult = { error?: { message?: string }; redirect?: boolean; paymentDetails?: unknown };
type CashfreeCtor = (o: { mode: "sandbox" | "production" }) => { checkout: (o: { paymentSessionId: string; redirectTarget: "_modal" }) => Promise<CashfreeResult> };

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

/** Pay for "plan:creator:monthly", "plan:pro:yearly", "topup:topup_30" ... with the mobile number Cashfree needs (kept on
 * the account after the first payment). Resolves when the window closes. */
export async function pay(item: string, coupon?: string, phone?: string): Promise<PayResult> {
  const [order] = await Promise.all([api.createOrder(item, coupon, phone), loadScript()]); // the server prices it (offer, coupon)
  const Cashfree = (window as unknown as { Cashfree: CashfreeCtor }).Cashfree;
  const r = await Cashfree({ mode: order.mode }).checkout({ paymentSessionId: order.sessionId, redirectTarget: "_modal" });
  // a phone's in-app browser that cannot show the window: Cashfree takes over the page and comes back to /pricing?order=…
  if (r.redirect) return new Promise<PayResult>(() => {});
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
