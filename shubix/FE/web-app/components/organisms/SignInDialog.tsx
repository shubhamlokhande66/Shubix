"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconButton } from "@/components/atoms";
import { AuthForm } from "@/components/organisms/AuthForm";
import { CodeForm } from "@/components/organisms/CodeForm";
import { savedRef } from "@/lib/marketing";
import { noteSignedIn } from "@/lib/boot";
import { needsSignIn, SIGN_IN } from "@/lib/returnTo";
import { useText } from "@/hooks/useApi";

/** after the emailed code: nothing to show, the popup closes */
const Nothing = () => null;

/** Signing in over the page (a Reel being made, "Find the best clips"): the login page's own form in a popup. Signed in, it
 * closes and what was pressed goes on; closed, the page is as it was. Google's page cannot be shown inside another: it
 * opens beside this one, and the popup goes on when it has signed in. Opened by signInHere (lib/returnTo.ts). */
export function SignInDialog() {
  const qc = useQueryClient(), text = useText();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "code" | "google">("form");
  const onDone = useRef<(() => void) | null>(null), box = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); onDone.current = null; };
  const done = () => {
    const go = onDone.current;
    if (!go) return;
    noteSignedIn();
    close();
    void qc.invalidateQueries();
    go();
  };
  const doneRef = useRef(done);
  useEffect(() => { doneRef.current = done; });
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      onDone.current = (e as CustomEvent<{ onDone: () => void }>).detail.onDone;
      setStep("form");
      setOpen(true);
    };
    window.addEventListener(SIGN_IN, on);
    return () => window.removeEventListener(SIGN_IN, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow, was = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); onDone.current = null; } };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); was?.focus?.(); };
  }, [open]);
  // Google in its own tab, or a password reset there: looked at when this page is seen again (Google: every 3 s too)
  useEffect(() => {
    if (!open || step === "code") return;
    let busy = false;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try { if (!(await needsSignIn())) doneRef.current(); } finally { busy = false; }
    };
    const t = step === "google" ? setInterval(check, 3000) : undefined;
    const seen = () => void check();
    window.addEventListener("focus", seen);
    document.addEventListener("visibilitychange", seen);
    return () => { clearInterval(t); window.removeEventListener("focus", seen); document.removeEventListener("visibilitychange", seen); };
  }, [open, step]);
  const google = () => {
    const url = `/api/auth/google?next=${encodeURIComponent("/signed-in")}&ref=${encodeURIComponent(savedRef() ?? "")}`;
    const w = 480, h = 720, wide = window.innerWidth >= 700;
    const feat = wide ? `popup,width=${w},height=${h},left=${Math.round(window.screenX + (window.outerWidth - w) / 2)},top=${Math.round(window.screenY + (window.outerHeight - h) / 2)}` : "";
    window.open(url, "shubix-signin", feat);
    setStep("google");
  };
  if (!open) return null;
  return (
    <div data-popup className="fixed inset-0 z-[1000] grid place-items-end bg-black/60 backdrop-blur-[2px] sm:place-items-center sm:p-4">
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={text("auth.signIn")}
        className="relative max-h-[94dvh] w-full animate-pop overflow-y-auto overscroll-contain rounded-t-[26px] border border-border bg-background p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:max-w-[460px] sm:rounded-[26px] sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <b className="font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.02em]">Sign in to make your Reel</b>
          <IconButton icon="close" plain label={text("common.close")} onClick={close} />
        </div>
        {step === "code" ? (
          <CodeForm justSent done={Nothing} onVerified={done} onOther={() => setStep("form")} />
        ) : (
          <>
            <AuthForm popup subtitle={text("auth.keepWork")} onGoogle={google} onSignedIn={({ needsCode }) => { if (needsCode) setStep("code"); else done(); }} />
            {step === "google" && <p role="status" className="m-0 mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-center text-[12.5px] font-semibold">Finish signing in with Google in the other tab. Your Reel goes on here by itself.</p>}
          </>
        )}
      </div>
    </div>
  );
}
