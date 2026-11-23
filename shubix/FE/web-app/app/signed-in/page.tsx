"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Spinner } from "@/components/atoms";
import { api, patiently } from "@/lib/api";
import { googleUrl, tellSignedIn } from "@/lib/googlePopup";
import { lastPage } from "@/lib/returnTo";
import { AuthFrame } from "@/components/molecules/AuthFrame";

/** The end of a sign-in opened beside the studio ("Make Reel" while signed out, lib/returnTo.ts signInBeside): this window
 * closes itself, and the studio, still open with its Reel, goes on. A browser that does not let it close says so. */
export default function SignedInPage() {
  const [open, setOpen] = useState(false);
  const [off, setOff] = useState(false);
  useEffect(() => {
    // opened by "Continue with Google": the server awake first, then Google's page, which comes back here
    if (new URLSearchParams(window.location.search).has("google")) {
      const go = () => window.location.replace(googleUrl("/signed-in"));
      void Promise.resolve().then(() => setOff(true));
      void patiently(() => api.health()).then(go, go);
      return;
    }
    tellSignedIn();
    try { window.opener?.focus(); } catch { /* another site's window */ }
    window.close();
    const t = setTimeout(() => setOpen(true), 400); // still here: this tab could not close itself
    return () => clearTimeout(t);
  }, []);
  if (off || !open) return <div className="grid min-h-svh place-items-center"><Spinner label={off ? "Opening Google…" : "Signing you in…"} /></div>;
  return (
    <AuthFrame>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success/15 text-success"><Icon name="check" size={28} /></span>
        <h1 className="m-0 text-[18px] font-semibold">You&apos;re signed in</h1>
        <p className="m-0 text-[13px] text-muted">Go back to the tab with your Reel: Shubix makes it there. You can close this tab.</p>
        <Button full onClick={() => { window.close(); window.location.assign(lastPage()); }}>Continue</Button>
      </div>
    </AuthFrame>
  );
}
