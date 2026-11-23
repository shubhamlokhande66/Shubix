"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api, errorMessage, patiently } from "@/lib/api";
import { emailOk, passwordOk } from "@/lib/validate";
import { clearRef, savedRef } from "@/lib/marketing";
import { useAccess, useText } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { Button, Card, Input } from "@/components/atoms";
import { ErrorBanner, Field, PasswordInput } from "@/components/molecules";

const TAB = "min-h-10 rounded-[9px] border-0 bg-transparent text-[12px] font-bold text-muted transition-[color,background-color,box-shadow,scale] duration-200 hover:text-foreground active:scale-[.985] motion-reduce:transition-none";
const TAB_ON = "bg-gold text-on-accent shadow-[0_5px_14px_-9px_var(--brand-glow),inset_0_1px_0_rgba(255,255,255,.28)] hover:text-on-accent";

/** The sign-in / create-account form: on its own page (app/login) and in the popup over a Reel being made (SignInDialog).
 * Each field says what is wrong as people type (after they leave it); the button waits until the form is right. */
export function AuthForm({ subtitle, firstError, popup = false, onGoogle, onGooglePopup, onSignedIn, onEmail }: {
  /** the line under the title ("" : the form's own) */
  subtitle?: string;
  /** an error to open with (Google's sign-in did not finish) */
  firstError?: string | null;
  /** in a popup: links to other pages open beside it */
  popup?: boolean;
  /** Google chosen: goes to Google's page, or opens it beside this one */
  onGoogle: () => void;
  /** the sign-in page: opens Google's window, true when it opened (else onGoogle, in this tab) */
  onGooglePopup?: () => boolean;
  /** signed in, or (a new account) the emailed code is next */
  onSignedIn: (r: { needsCode: boolean; adminCode: boolean }) => void;
  onEmail?: (email: string) => void;
}) {
  const qc = useQueryClient();
  const text = useText();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState(""); // creating an account: the password a second time
  const [touched, setTouched] = useState<Record<string, boolean>>({}); // the fields left once: their message shows
  const [error, setError] = useState<string | null>(null);
  // which way is signing in: only that button shows its loader (one loader on screen, the other buttons just wait)
  const [busyWith, setBusyWith] = useState<"google" | "email" | null>(null), busy = busyWith !== null;
  const access = useAccess(), google = access.google && access.googleReady;
  useEffect(() => { if (firstError) setError(firstError); }, [firstError]);
  // a sleeping server wakes in about 15 s: after 8 s the button says so (it waits up to a minute, lib/api.ts patiently)
  const [slow, setSlow] = useState(false);
  useEffect(() => { setSlow(false); if (!busy) return; const t = setTimeout(() => setSlow(true), 8_000); return () => clearTimeout(t); }, [busy]);
  const withGoogle = async () => {
    if (popup) { onGoogle(); return; }   // a window opens only inside the click
    if (onGooglePopup?.()) return;
    setBusyWith("google"); setError(null);
    try { await patiently(() => api.health()); } // awake first: Google's page then comes back to a server that answers
    catch (err) { setError(errorMessage(err)); setBusyWith(null); return; }
    onGoogle();
  };
  const signin = mode === "signin";
  const touch = (k: string) => setTouched((x) => ({ ...x, [k]: true }));

  // what is wrong with each field (shown once the field was left, or the form sent)
  const emailErr = email && !emailOk(email) ? text("auth.badEmail") : "";
  const pwErr = !signin && password && !passwordOk(password) ? text("auth.shortPassword") : "";
  const againErr = !signin && again && again !== password ? text("auth.mismatch") : "";
  const valid = emailOk(email) && (signin ? !!password : passwordOk(password) && again === password);
  function changeMode(next: "signin" | "signup") {
    setMode(next);
    setError(null);
    setAgain("");
    setTouched({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTouched({ email: true, password: true, again: true });
    if (!valid) return;
    setBusyWith("email");
    try {
      const r = signin ? await api.login(email.trim(), password) : await api.register(email.trim(), password, savedRef());
      if (!signin) clearRef(); // the invite is used
      await qc.invalidateQueries();
      onSignedIn({ needsCode: !signin || r.user?.emailVerified === false, adminCode: "adminCode" in r && !!r.adminCode });
    } catch (err) {
      setError(errorMessage(err));
      setBusyWith(null);   // (signed in: the button stays busy until the next screen is there)
    }
  }

  return (
    <>
            <div role="group" aria-label={text("auth.signIn")} className="mb-3 shadow-[0_8px_24px_-20px_rgba(0,0,0,.35)] grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
              <button type="button" disabled={busy} aria-pressed={signin} onClick={() => changeMode("signin")} className={cn(TAB, signin && TAB_ON)}>{text("auth.signIn")}</button>
              <button type="button" disabled={busy} aria-pressed={!signin} onClick={() => changeMode("signup")} className={cn(TAB, !signin && TAB_ON)}>{text("auth.createLink")}</button>
            </div>

            <Card key={mode} className="relative rounded-[22px] bg-[color:color-mix(in_srgb,var(--surface)_96%,var(--accent))] shadow-[0_24px_60px_-38px_rgba(0,0,0,.36),inset_0_1px_0_rgba(255,255,255,.45)] flex flex-col gap-4 overflow-hidden p-5 sm:gap-6 sm:p-7 lg:p-8">
              <div className="pointer-events-none absolute -top-[90px] -right-[70px] z-0 size-[210px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_70%)]" aria-hidden />
              <div className="relative z-10">
                <h1 id="auth-title" className="m-0 font-[family-name:var(--font-display)] text-[25px] font-semibold tracking-[-0.035em] sm:text-[28px]">{text(signin ? "auth.signIn" : "auth.signUp")}</h1>
                <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-muted sm:text-[13px]">{subtitle || text(signin ? "auth.signInSub" : "auth.signUpSub")}</p>
              </div>
              {google && (
                <div className="relative z-10 flex flex-col gap-3">
                  <Button type="button" variant="secondary" size="lg" loading={busyWith === "google"} disabled={busy} onClick={() => void withGoogle()} className="!h-12 w-full !rounded-xl !text-[13.5px]">
                    {busyWith !== "google" && <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>}
                    {busyWith === "google" ? text(slow ? "auth.waking" : "auth.wait") : text("auth.google")}
                  </Button>
                  <span className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.1em] text-muted"><i className="h-px flex-1 bg-border" />{text("auth.or")}<i className="h-px flex-1 bg-border" /></span>
                </div>
              )}
              <form onSubmit={submit} noValidate className="relative z-10 flex flex-col gap-3 sm:gap-[18px]"><fieldset disabled={busy} className="contents">
                <Field label={text("auth.email")} error={touched.email ? emailErr : ""}>
                  <Input type="email" autoComplete="email" placeholder={text("auth.emailPlaceholder")} value={email} aria-invalid={!!(touched.email && emailErr) || undefined}
                    className={touched.email && emailErr ? "border-danger" : undefined} onChange={(e) => { setEmail(e.target.value); onEmail?.(e.target.value); }} onBlur={() => touch("email")} />
                </Field>
                <Field label={text("auth.password")}
                  error={touched.password ? pwErr : ""}
                  ok={!signin && passwordOk(password) ? text("auth.strongEnough") : ""}
                  hint={!signin ? text("auth.lengthHint") : undefined}>
                  <PasswordInput autoComplete={signin ? "current-password" : "new-password"} placeholder={text(signin ? "auth.passwordPlaceholder" : "auth.newPasswordPlaceholder")}
                    value={password} invalid={!!(touched.password && pwErr)} onChange={(e) => setPassword(e.target.value)} onBlur={() => touch("password")} />
                </Field>
                {!signin && (
                  <Field label={text("auth.confirmPassword")} error={touched.again || (again.length >= password.length && password) ? againErr : ""} ok={again && again === password ? text("auth.match") : ""}>
                    <PasswordInput autoComplete="new-password" placeholder={text("auth.confirmPlaceholder")} value={again} invalid={!!(touched.again && againErr)} onChange={(e) => setAgain(e.target.value)} onBlur={() => touch("again")} />
                  </Field>
                )}
                {error && <ErrorBanner message={error} />}
                <Button type="submit" size="lg" icon="sparkle" loading={busyWith === "email"} disabled={!valid || busy} className="mt-1 !shadow-[0_14px_26px_-16px_var(--brand-glow),inset_0_1px_0_rgba(255,255,255,.26)] !h-12 w-full !rounded-xl !text-[13.5px]">
                  {busyWith === "email" ? text(slow ? "auth.waking" : "auth.wait") : text(signin ? "auth.signIn" : "auth.signUpButton")}
                </Button>
              </fieldset></form>
              <div className="relative z-10 flex min-h-5 flex-col items-center gap-2 pr-12 text-center text-[12px] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pr-0 sm:text-left">
                <span className="text-muted">{text(signin ? "auth.newHere" : "auth.haveAccount")} <button type="button" className="font-bold text-accent hover:underline" onClick={() => changeMode(signin ? "signup" : "signin")}>{text(signin ? "auth.createLink" : "auth.signIn")}</button></span>
                {signin && <Link href="/forgot" target={popup ? "_blank" : undefined} className="shrink-0 font-bold text-accent hover:underline">{text("auth.forgotLink")}</Link>}
              </div>
            </Card>
    </>
  );
}
