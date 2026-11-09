"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Chip, ChipRow, Toggle } from "@/components/atoms";
import { ErrorBanner } from "@/components/molecules";
import { useAccess } from "@/hooks/useApi";
import { api, errorMessage } from "@/lib/api";
import { ACCESS_PAGES, ALWAYS_OPEN, STUDIO_ASK, type Access } from "@shubix/core/lib/access";

/** Administration → Settings → Sign-in rules: which pages people may open before they have an account, when the studio
 * asks for one (the song and the clips are kept through the sign-in), and "Continue with Google". */
export function AccessSettings() {
  const qc = useQueryClient(), a = useAccess();
  const save = useMutation({ meta: { success: "Saved", errorShown: true },
    mutationFn: (p: Partial<Access>) => api.setAccess(p),
    onSuccess: (x) => qc.setQueryData(["access"], x),
  });
  const set = (p: Partial<Access>) => save.mutate(p);
  return (
    <section aria-label="Sign-in rules" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <b className="text-[14px]">Open without an account</b>
        <p className="m-0 text-[12.5px] text-muted">Every other page asks people to sign in first. Keep Home and Guides open: Google and AdSense read them.</p>
        {ACCESS_PAGES.map((p) => (
          <Toggle key={p.path} label={p.label} hint={p.path} on={a.open.includes(p.path)} disabled={save.isPending}
            onChange={(on) => set({ open: on ? [...a.open, p.path] : a.open.filter((x) => x !== p.path) })} />
        ))}
        <p className="m-0 text-[11.5px] text-muted">Always open: {ALWAYS_OPEN.join(", ")} and the sign-in pages. Always need an account: My Reels, My account and the administration.</p>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <b className="text-[14px]">In the studio, ask for an account</b>
        <ChipRow aria-label="When the studio asks for an account" wrap>
          {STUDIO_ASK.map((s) => <Chip key={s.key} on={a.studioAsk === s.key} disabled={save.isPending} onClick={() => set({ studioAsk: s.key })}>{s.label}</Chip>)}
        </ChipRow>
        <p className="m-0 text-[12.5px] text-muted">Their song and clips are kept on their device while they sign in, and the studio carries on where they were.</p>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Toggle label="Continue with Google" on={a.google} disabled={save.isPending || !a.googleReady} onChange={(google) => set({ google })}
          hint={a.googleReady ? "A button on the sign-in page" : "Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server (Cloudflare secrets)"} />
      </div>
      {save.error && <ErrorBanner message={errorMessage(save.error)} />}
    </section>
  );
}
