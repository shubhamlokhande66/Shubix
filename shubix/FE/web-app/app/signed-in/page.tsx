"use client";

import { useEffect, useState } from "react";
import { Button, Icon } from "@/components/atoms";
import { AuthFrame } from "@/components/molecules/AuthFrame";

/** The end of a sign-in opened beside the studio ("Make Reel" while signed out, lib/returnTo.ts signInBeside): this window
 * closes itself, and the studio, still open with its Reel, goes on. A browser that does not let it close says so. */
export default function SignedInPage() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { window.opener?.focus(); } catch { /* another site's window */ }
    window.close();
    const t = setTimeout(() => setOpen(true), 400); // still here: this tab could not close itself
    return () => clearTimeout(t);
  }, []);
  if (!open) return null;
  return (
    <AuthFrame>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success/15 text-success"><Icon name="check" size={28} /></span>
        <h1 className="m-0 text-[18px] font-semibold">You&apos;re signed in</h1>
        <p className="m-0 text-[13px] text-muted">Go back to the tab with your Reel: Shubix makes it there. You can close this tab.</p>
        <Button full onClick={() => { window.close(); window.location.assign("/"); }}>Close</Button>
      </div>
    </AuthFrame>
  );
}
