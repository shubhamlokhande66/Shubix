"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useText } from "@/hooks/useApi";
import { takeNext } from "@/lib/returnTo";
import { Button, Card, Icon, Spinner } from "@/components/atoms";
import { AuthFrame } from "@/components/molecules/AuthFrame";
import { ErrorBanner } from "@/components/molecules";
import { CodeForm } from "@/components/organisms/CodeForm";

const Done = ({ email }: { email: string }) => {
  const text = useText();
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-success/15 text-success"><Icon name="check" size={28} /></span>
      <h2 className="m-0 text-[17px] font-semibold">{text("auth.verifiedTitle")}</h2>
      <p className="m-0 text-[13px] text-muted">{text("auth.verifiedText", { email })}</p>
      <Button full onClick={() => window.location.replace(takeNext())}>{text("auth.continue")}</Button>
    </div>
  );
};

/** A "Verify my email" link emailed before the codes. */
function ByLink({ token }: { token: string }) {
  const qc = useQueryClient(), text = useText();
  const [state, setState] = useState<{ email?: string; error?: string }>({});
  const once = useRef(false); // the link works once: do not send it twice (React's dev double effect)
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api.verifyEmail(token)
      .then((r) => { setState({ email: r.email }); void qc.invalidateQueries({ queryKey: ["me"] }); })
      .catch((e) => setState({ error: errorMessage(e) }));
  }, [token, qc]);
  if (state.error) return <><ErrorBanner message={state.error} /><Button href="/verify">{text("auth.enterCode")}</Button></>;
  if (!state.email) return <Spinner label={text("auth.verifying")} />;
  return <Done email={state.email} />;
}

function Verify() {
  const q = useSearchParams(), token = q.get("token") ?? "";
  return token ? <ByLink token={token} /> : <CodeForm justSent={q.get("sent") === "1"} done={Done} />;
}

/** Verify the email: the 6-digit code from the sign-up email (or a link emailed before the codes). */
export default function VerifyPage() {
  const text = useText();
  return (
    <AuthFrame>
      <Card className="flex flex-col gap-3">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-[-0.015em]">{text("auth.verifyTitle")}</h1>
        <Suspense fallback={<Spinner size="sm" />}><Verify /></Suspense>
      </Card>
    </AuthFrame>
  );
}
