"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, type AdminReview } from "@/lib/api";
import { Button, Card } from "@/components/atoms";
import { ErrorBanner } from "@/components/molecules";
import { Stars } from "@/components/organisms/ReviewPrompt";
import { cn } from "@/lib/cn";
import { ago } from "./format";

/** Admin → Reviews: what people said after exporting a Reel. Approve one to show it on Home (its comment, stars and first
 * name); hide it to take it off. "What to improve" is only ever shown here. */

type Status = AdminReview["status"];
const FILTERS: { id: Status | "all"; label: string }[] = [{ id: "pending", label: "Waiting" }, { id: "approved", label: "On Home" }, { id: "hidden", label: "Hidden" }, { id: "all", label: "All" }];
const TONE: Record<Status, string> = { pending: "bg-gold text-on-accent", approved: "bg-accent text-on-accent", hidden: "bg-surface-2 text-muted" };

export function ReviewsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | "all">("pending");
  const q = useQuery({ queryKey: ["admin-reviews", status], queryFn: () => api.adminReviews(status === "all" ? undefined : status) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-reviews"] }); void qc.invalidateQueries({ queryKey: ["public-reviews"] }); };
  const set = useMutation({ mutationFn: (p: { id: string; status: Status }) => api.setAdminReview(p.id, p.status), onSuccess: refresh });
  const del = useMutation({ meta: { success: "Review deleted" }, mutationFn: (id: string) => api.deleteAdminReview(id), onSuccess: refresh });
  const rows = q.data?.reviews ?? [], counts = q.data?.counts ?? {};
  const busy = (id: string) => (set.isPending && set.variables?.id === id) || (del.isPending && del.variables === id);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}
              className={cn("rounded-full border px-3 py-1 text-xs font-bold", status === f.id ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-muted hover:text-foreground")}>
              {f.label}{f.id !== "all" && counts[f.id] ? ` (${counts[f.id]})` : ""}
            </button>
          ))}
        </div>
        <p className="m-0 mt-2 text-xs text-muted">Asked once after each exported Reel. Approve a review to show it on Home with its stars and the person&apos;s first name. &ldquo;Improve&rdquo; is never shown publicly.</p>
      </Card>
      {(q.error || set.error) && <ErrorBanner message={errorMessage(q.error ?? set.error)} onRetry={() => q.refetch()} />}
      {!q.error && <Card><p className="m-0 text-sm">{q.isLoading ? "Loading…" : rows.length ? `${rows.length} review${rows.length === 1 ? "" : "s"}.` : "No reviews here yet."}</p></Card>}
      {rows.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={r.rating} size={16} />
            <b className="text-[14px]">{r.name}</b>
            <span className="text-xs text-muted">{r.email ?? ""} · {ago(r.at)}</span>
            <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[r.status])}>{FILTERS.find((f) => f.id === r.status)?.label}</span>
          </div>
          {r.comment ? <p className="m-0 mt-2 whitespace-pre-wrap break-words text-[14px]">&ldquo;{r.comment}&rdquo;</p> : <p className="m-0 mt-2 text-[13px] italic text-muted">No comment (stars only).</p>}
          {r.improvement && (
            <div className="mt-2 rounded-xl bg-surface-2 p-2.5 text-[13px]">
              <b className="text-[11px] uppercase tracking-wide text-muted">Improve</b>
              <p className="m-0 mt-0.5 whitespace-pre-wrap break-words">{r.improvement}</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="mr-auto break-all text-[11px] text-muted">Reel {r.reelId}</code>
            {r.status !== "approved" && <Button size="sm" icon="check" disabled={!r.comment || busy(r.id)} title={r.comment ? undefined : "A review without a comment cannot show on Home"} onClick={() => set.mutate({ id: r.id, status: "approved" })}>Show on Home</Button>}
            {r.status !== "hidden" && <Button size="sm" variant="secondary" disabled={busy(r.id)} onClick={() => set.mutate({ id: r.id, status: "hidden" })}>Hide</Button>}
            <Button size="sm" variant="danger" icon="trash" loading={del.isPending && del.variables === r.id} disabled={busy(r.id)} onClick={() => del.mutate(r.id)}>Delete</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
