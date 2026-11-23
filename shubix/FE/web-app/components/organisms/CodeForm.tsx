"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useMe, useText } from "@/hooks/useApi";
import { useCountdown } from "@/lib/useCountdown";
import { maskEmail } from "@/lib/validate";
import { Button, Spinner } from "@/components/atoms";
import { ErrorBanner } from "@/components/molecules";
import { OtpInput } from "@/components/molecules/OtpInput";

/** The 6-digit code from the sign-up email (the person is signed in). */
export function CodeForm({ justSent, done: Done, onVerified, onOther }: {
  justSent: boolean;
  done: React.ComponentType<{ email: string }>;
  /** the code was right (the popup goes on at once) */
  onVerified?: () => void;
  /** another email: the sign-in form again (its own page: /login) */
  onOther?: () => void;
}) {
  const qc = useQueryClient(), text = useText(), me = useMe(), router = useRouter();
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null), [note, setNote] = useState<string | null>(null);
  const wait = useCountdown(justSent ? 60 : 0);
  // a new sign-up (no account until its code) or an account whose email is not proved yet
  const user = me.data?.user, pending = me.data?.pending, codeWait = user?.codeWait ?? pending?.codeWait, startWait = wait.start;
  useEffect(() => { if (codeWait) startWait(codeWait); }, [codeWait]); // eslint-disable-line react-hooks/exhaustive-deps -- how long the server still wants, on any way here
  if (me.isLoading) return <Spinner />;
  if (!user && !pending) return <p className="m-0 text-[13px]">{text("auth.signInToVerify")} <Link href="/login?next=%2Fverify" className="font-bold text-accent">{text("auth.signIn")}</Link></p>;
  if (done || (user && user.emailVerified !== false)) return <Done email={done ?? user!.email} />;
  const email = user?.email ?? pending!.email;

  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true); setError(null);
    try { const r = await api.verifyCode(c); setDone(r.email); void qc.invalidateQueries({ queryKey: ["me"] }); onVerified?.(); }
    catch (e) { setError(errorMessage(e)); setCode(""); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setError(null); setNote(null);
    try { const r = await api.resendVerify(); wait.start(r.wait ?? 60); if (r.sent === false) setError(text("auth.codeNotSent")); else setNote(text("auth.codeResent")); }
    catch (e) { const w = (e as { details?: { wait?: unknown } }).details?.wait; if (typeof w === "number") wait.start(w); else setError(errorMessage(e)); }
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void verify(); }}><fieldset disabled={busy} className="contents">
      <p className="m-0 text-[13px] text-muted">{text("auth.codeSentTo", { email: maskEmail(email) })}</p>
      <OtpInput label={text("auth.codeLabel")} value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={(v) => void verify(v)} invalid={!!error} disabled={busy} />
      {error && <ErrorBanner message={error} />}
      {note && !error && <p className="m-0 text-[12.5px] font-semibold text-success">{note}</p>}
      <Button type="submit" loading={busy} disabled={code.length !== 6}>{text("auth.verifyButton")}</Button>
      <p className="m-0 text-center text-[12.5px] text-muted">
        {text("auth.noCode")}{" "}
        {wait.left > 0 ? <span>{text("auth.resendIn", { s: wait.left })}</span>
          : <button type="button" className="font-bold text-accent" onClick={() => void resend()}>{text("auth.resendCode")}</button>}
      </p>
      <p className="m-0 text-center text-[11.5px] text-muted">{text("auth.checkSpam")}</p>
      <button type="button" className="text-center text-[12.5px] font-bold text-accent" onClick={() => void api.logout().then(() => qc.invalidateQueries()).then(() => (onOther ? onOther() : router.replace("/login")))}>{text("auth.useOtherEmail")}</button>
    </fieldset></form>
  );
}
