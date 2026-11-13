"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { Button, Card, Input } from "@/components/atoms";
import { ErrorBanner } from "@/components/molecules";
import { cn } from "@/lib/cn";
import { ago } from "./format";

/** One Reel's whole story, top to bottom (server/reelLogs.ts): the latest Reels first (search by its id, the start of
 * it, or the person's email); open one for every line with its date and time, what it was, how long it took, and the
 * JSON with it (what the studio sent to the API and got back, each AI call's prompt and answer). Kept 30 days. */

const STEP: Record<string, string> = { song: "Song", beats: "Beats", clip: "Clip", compress: "Compress", edit: "Edit", ai: "AI (server)", api: "API call", export: "Export" };
const TONE: Record<string, string> = { error: "border-l-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]", warn: "border-l-gold bg-[color-mix(in_srgb,var(--gold)_6%,transparent)]", info: "border-l-border" };
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

export function LogsTab() {
  const [q, setQ] = useState(""), [search, setSearch] = useState(""), [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin-reel-logs", search], queryFn: () => api.adminReelLogs(search) });
  if (open) return <ReelLog reelId={open} onBack={() => setOpen(null)} />;
  const rows = list.data?.reels ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (/^[A-Za-z0-9_-]{8,40}$/.test(v) && !v.includes("@") && rows.every((r) => r.reelId !== v)) setOpen(v); else setSearch(v); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reel ID (or its start), or the person's email" aria-label="Search Reels" className="min-w-0 flex-1" />
          <Button type="submit" icon="search">Find</Button>
        </form>
        <p className="m-0 mt-2 text-xs text-muted">
          Every Reel made in the last 30 days, newest first. The Reel ID is in the editor&apos;s address (/editor?p=…). Open one for its whole log, top to bottom.
        </p>
      </Card>
      {list.error && <ErrorBanner message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {!list.error && <Card><p className="m-0 text-sm">{list.isLoading ? "Loading…" : rows.length ? `${rows.length} Reel${rows.length === 1 ? "" : "s"}${search ? ` for "${search}"` : ""}.` : search ? `No Reel for "${search}".` : "No Reel logs yet."}</p></Card>}
      {rows.map((r) => (
        <button key={r.reelId} type="button" onClick={() => setOpen(r.reelId)} className="block w-full text-left">
          <Card className="transition-colors hover:border-accent/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="break-all text-[13px] font-bold">{r.reelId}</code>
              <span className="flex gap-1.5 text-[11px] font-bold">
                {r.errors > 0 && <span className="rounded-full bg-[var(--danger)] px-2 py-0.5 text-white">{r.errors} error{r.errors === 1 ? "" : "s"}</span>}
                {r.warns > 0 && <span className="rounded-full bg-gold px-2 py-0.5 text-on-accent">{r.warns} warning{r.warns === 1 ? "" : "s"}</span>}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{r.lines} lines</span>
              </span>
            </div>
            <p className="m-0 mt-1 text-xs text-muted">{r.user ?? "Guest"} · started {when(r.first)} · last {ago(r.last)}</p>
            {r.ua && <p className="m-0 truncate text-xs text-muted" title={r.ua}>{r.ua}</p>}
          </Card>
        </button>
      ))}
    </div>
  );
}

function ReelLog({ reelId, onBack }: { reelId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [only, setOnly] = useState<string>("all"), [all, setAll] = useState(false);
  const q = useQuery({ queryKey: ["admin-reel-log", reelId], queryFn: () => api.adminReelLog(reelId) });
  const del = useMutation({ meta: { success: "Log deleted" }, mutationFn: () => api.deleteAdminReelLog(reelId), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-reel-logs"] }); onBack(); } });
  const lines = q.data?.lines ?? [];
  const steps = [...new Set(lines.map((l) => l.step))];
  const shown = lines.filter((l) => only === "all" || (only === "problems" ? l.level !== "info" : l.step === only));
  const t0 = lines.length ? new Date(lines[0].at).getTime() : 0;
  const copy = () => void navigator.clipboard?.writeText(JSON.stringify({ reelId, lines }, null, 2)).catch(() => {});
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon="back" onClick={onBack}>All Reels</Button>
          <code className="min-w-0 flex-1 break-all text-[13px] font-bold">{reelId}</code>
          <Button size="sm" variant="secondary" icon="copy" onClick={copy} disabled={!lines.length}>Copy JSON</Button>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => q.refetch()}>Refresh</Button>
          <Button size="sm" variant="danger" icon="trash" loading={del.isPending} onClick={() => del.mutate()} disabled={!lines.length}>Delete</Button>
        </div>
        {lines[0]?.ua && <p className="m-0 mt-2 break-all text-xs text-muted">{lines[0].ua}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {["all", "problems", ...steps].map((s) => (
            <button key={s} type="button" aria-pressed={only === s} onClick={() => setOnly(s)}
              className={cn("rounded-full border px-3 py-1 text-xs font-bold", only === s ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-muted hover:text-foreground")}>
              {s === "all" ? `All (${lines.length})` : s === "problems" ? `Problems (${lines.filter((l) => l.level !== "info").length})` : `${STEP[s] ?? s} (${lines.filter((l) => l.step === s).length})`}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Open all JSON</label>
        </div>
      </Card>
      {q.error && <ErrorBanner message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.isLoading && <Card><p className="m-0 text-sm">Loading…</p></Card>}
      {!q.isLoading && !lines.length && !q.error && <Card><p className="m-0 text-sm">No lines for this Reel. Check the ID (the editor&apos;s address: /editor?p=…).</p></Card>}
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {shown.map((l) => (
          <li key={l.id} className={cn("rounded-xl border border-l-4 border-border bg-surface px-3 py-2", TONE[l.level] ?? TONE.info)}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
              <time dateTime={l.at} className="font-mono tabular-nums">{when(l.at)}</time>
              <span className="font-mono tabular-nums">+{((new Date(l.at).getTime() - t0) / 1000).toFixed(1)} s</span>
              <span className="rounded bg-surface-2 px-1.5 font-bold uppercase tracking-wide">{STEP[l.step] ?? l.step}</span>
              <span>{l.source === "server" ? "server" : "browser"}</span>
              {l.ms != null && <span className="font-mono tabular-nums">{l.ms >= 1000 ? `${(l.ms / 1000).toFixed(1)} s` : `${l.ms} ms`}</span>}
            </div>
            <p className={cn("m-0 mt-0.5 break-words text-[13.5px] font-medium", l.level === "error" && "text-[var(--danger)]")}>{l.msg}</p>
            {l.data != null && (
              <details open={all} className="mt-1 text-xs">
                <summary className="cursor-pointer text-muted">JSON</summary>
                <pre className="mt-1 max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2 text-[11.5px] leading-snug">{JSON.stringify(l.data, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
