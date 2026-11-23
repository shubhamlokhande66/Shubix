"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dropzone } from "@/components/molecules/Dropzone";
import { ProgressBar } from "@/components/molecules/ProgressBar";
import { Badge, Button, Card, Heading, Icon, IconButton, Select, Spinner } from "@/components/atoms";
import { EmptyState, ErrorBanner, Field, PageHeader, SidePanel } from "@/components/molecules";
import { StatTile } from "@/components/molecules/StatTile";
import { api, errorMessage } from "@/lib/api";
import { askToNotify, stayAlive, titleDone, titleProgress } from "@/lib/background";
import { PICKER_VIDEO, isVideoFile } from "@/lib/format";
import type { LearningOdd, StyleSuggestion } from "@/types/api";

/** The studio's own reader (components/studio/engine.ts, window.shubixTeach): the same reading as "Copy a Reel", so the
 * styles learned here are the ones every Reel is made with. */
type TeachResult = { ok: number; bad: number; skip: number; cuts: number; newCuts: number; effects: number; stopped: boolean };
type Teacher = { run: (files: File[], kind: string, shared: boolean, say: (text: string, part?: number) => void) => Promise<TeachResult>; stop: () => void; busy: () => boolean };
type KindSkill = { n: number; accuracy: { n: number; learned: number; baseline: number } | null };
const skillOf = async (kind: string): Promise<KindSkill> => {
  const r = await fetch(`/api/studio/styles/learned?category=${encodeURIComponent(kind)}&scope=all`, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`Could not read the ${kind} style (${r.status})`);
  return r.json();
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const readerOf = (f: HTMLIFrameElement | null) => (f?.contentWindow as (Window & { shubixTeach?: Teacher }) | null | undefined)?.shubixTeach;

/** Many Reels at once (any number: 400–500 is fine), each read on this device by the studio's reader in a frame no one
 * sees; the video never leaves the device, only its numbers go to the database, shared, so every creator's Reels of
 * that kind are made with them. Before and after: how close Shubix's style of the kind comes to a real Reel of it. */
function TeachForm({ first = "wedding", onBusy }: { first?: string; onBusy?: (busy: boolean) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const qc = useQueryClient();
  const [kind, setKind] = useState(first);
  const [files, setFiles] = useState<File[]>([]);
  const [load, setLoad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [part, setPart] = useState(0);
  const [result, setResult] = useState<{ r: TeachResult; before: KindSkill | null; after: KindSkill | null; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skill = useQuery({ queryKey: ["kind-skill", kind], queryFn: () => skillOf(kind), staleTime: 60_000, retry: 1 });

  // the reader: the studio page in a tiny frame (kept on screen: a frame that is not shown does not decode video)
  async function teacher(): Promise<Teacher> {
    setLoad(true);
    for (let i = 0; i < 240; i++) {
      const t = readerOf(frame.current);
      if (t) return t;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error("Shubix's reader did not start. Reload the page and try again.");
  }
  async function start() {
    setError(null); setResult(null); setBusy(true); setPart(0); setStatus("Starting Shubix's reader…"); onBusy?.(true);
    const rest = stayAlive(); askToNotify();   // from this tap: it goes on in another tab, and minimized
    const ask = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", ask);
    const k = kind, list = files;
    try {
      const before = await skillOf(k).catch(() => null);
      const t = await teacher();
      const r = await t.run(list, k, true, (text, p) => { setStatus(text); if (p !== undefined) { setPart(p); titleProgress("learn", "Learning Reels", p); } });
      const after = await skillOf(k).catch(() => null);
      setResult({ r, before, after, kind: k }); setFiles([]);
      qc.invalidateQueries({ queryKey: ["kind-skill", k] });
      qc.invalidateQueries({ queryKey: ["learning-log"] }); qc.invalidateQueries({ queryKey: ["style-kinds"] });
    } catch (e) { setError(errorMessage(e)); }
    finally { rest(); titleDone("learn"); window.removeEventListener("beforeunload", ask); setBusy(false); setStatus(""); onBusy?.(false); }
  }
  const stop = () => { readerOf(frame.current)?.stop(); setStatus("Stopping after this Reel…"); };
  const name = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? k;
  const s = skill.data;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] text-muted">Choose the kind, then as many Reels of it as you like (400–500 at a time is fine). Each one is read here, on this device: its cuts, transitions, pace on the beat, zooms and look. The video never leaves the device; only those numbers are saved, and every {name(kind)} Reel Shubix makes follows them.</p>
      <Card className="flex flex-col gap-3">
        <Field label="Kind of Reel">
          <Select aria-label="Kind of Reel" value={kind} disabled={busy} onChange={(e) => { setKind(e.target.value); setResult(null); }} className="h-10 text-[13px]">
            {KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </Select>
        </Field>
        <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-[12.5px]" aria-live="polite">
          {skill.isLoading ? <span className="text-muted">Reading what Shubix knows about {name(kind)} Reels…</span>
            : !s || !s.n ? <span className="text-muted">Shubix has not learned any {name(kind)} Reel yet.</span>
            : <span>Shubix knows <b>{s.n}</b> {name(kind)} Reel{s.n === 1 ? "" : "s"}{s.accuracy
              ? <>: its {name(kind)} style comes <b>{pct(s.accuracy.learned)}</b> close to a real one (a style that knows nothing: {pct(s.accuracy.baseline)}).</>
              : ". With three or more it shows how close it comes."}</span>}
        </div>
        <Dropzone label={`Drop ${name(kind)} Reels here`} hint="MP4, MOV, WEBM · as many as you like" accept={PICKER_VIDEO} multiple disabled={busy} validate={isVideoFile}
          onReject={(n) => setError(`Not a video: ${n.join(", ")}`)} onFiles={(f) => { setError(null); setResult(null); setFiles((cur) => [...cur, ...f]); }} />
        {files.length > 0 && (
          <div className="flex items-center gap-2 text-[13px]">
            <Icon name="video" size={15} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">{files.length} Reel{files.length === 1 ? "" : "s"} chosen ({Math.round(files.reduce((a, f) => a + f.size, 0) / 1e6)} MB)</span>
            {!busy && <Button size="sm" variant="ghost" onClick={() => setFiles([])}>Clear</Button>}
          </div>
        )}
      </Card>
      {error && <ErrorBanner title="Could not learn from these Reels" message={error} />}
      {busy && <ProgressBar value={part * 100} label={status || "Reading"} showEta />}
      {busy && <p className="m-0 text-[12px] text-muted">You can use another tab or app, or minimize this window: it goes on. Keep this tab open and the computer awake. Stopped or closed, it goes on where it was next time: Reels already learned are skipped.</p>}
      {result && (
        <Card className="flex flex-col gap-1.5 text-[13px]" aria-label="What was learned">
          <p className="m-0 font-semibold">{result.r.stopped ? "Stopped. " : ""}Learned from {result.r.ok} {name(result.kind)} Reel{result.r.ok === 1 ? "" : "s"} ✓</p>
          {result.r.skip > 0 && <p className="m-0 text-muted">{result.r.skip} already learned, skipped</p>}
          {result.r.bad > 0 && <p className="m-0 text-muted">{result.r.bad} could not be read (too short, or no cuts): see the Learning log</p>}
          {result.r.cuts > 0 && <p className="m-0 text-muted">{result.r.cuts - result.r.newCuts} of {result.r.cuts} transitions known{result.r.newCuts ? `, ${result.r.newCuts} new ones Shubix cannot make yet` : ""}{result.r.effects ? `, ${result.r.effects} effects not learned` : ""}</p>}
          {result.after?.accuracy && (
            <p className="m-0">Shubix&apos;s {name(result.kind)} style now comes <b>{pct(result.after.accuracy.learned)}</b> close to a real one
              {result.before?.accuracy ? ` (before: ${pct(result.before.accuracy.learned)})` : ""}, from {result.after.n} Reels.</p>
          )}
        </Card>
      )}
      <div className="flex justify-end gap-2">
        {busy && <Button variant="ghost" onClick={stop}>Stop</Button>}
        <Button icon="trend" loading={busy} disabled={busy || files.length === 0} onClick={() => void start()}>
          {busy ? "Learning…" : files.length ? `Teach Shubix ${files.length} Reel${files.length === 1 ? "" : "s"}` : "Teach Shubix"}
        </Button>
      </div>
      {load && <iframe ref={frame} src="/engine" title="Shubix's reader" aria-hidden tabIndex={-1} className="pointer-events-none fixed bottom-0 right-0 h-[4px] w-[4px] border-0 opacity-0" />}
    </div>
  );
}

const KINDS: [string, string][] = [["wedding", "Wedding"], ["travel", "Travel"], ["festival", "Festival"], ["dance", "Dance"], ["talking", "Talking"], ["product", "Product"],
  ["food", "Food"], ["fitness", "Fitness"], ["vlog", "Vlog"], ["birthday", "Birthday"], ["car", "Car & bike"], ["shop", "Shop & opening"], ["event", "Event & party"], ["other", "Other"]]; // server/studio/styles.ts CATEGORIES

function SuggestionRow({ s }: { s: StyleSuggestion }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["style-suggestions"] });
  const use = useMutation({ mutationFn: () => api.useStyleSuggestion(s.id, kind), onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  const remove = useMutation({ meta: { success: "Removed" }, mutationFn: () => api.removeStyleSuggestion(s.id), onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  const busy = use.isPending || remove.isPending;
  return (
    <li className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <Badge tone={s.from === "made" ? "success" : "brand"}>{s.from === "made" ? "Made & saved" : "Copied"}</Badge>
        <b className="min-w-0 flex-1 truncate text-[13.5px]">{s.name}</b>
      </div>
      <span className="text-[12px] text-muted">{s.dur}s{s.bpm ? ` · ${s.bpm} BPM` : ""} · {s.pace}{s.trans ? ` · ${s.trans}` : ""}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={`Kind of Reel for ${s.name}`} value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 min-w-0 flex-1 text-[13px]">
          <option value="">Kind of Reel…</option>
          {KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </Select>
        <Button size="sm" loading={use.isPending} disabled={busy || !kind} onClick={() => { setError(null); use.mutate(); }}>Use</Button>
        <IconButton icon="trash" size={34} iconSize={15} plain label={`Remove ${s.name}`} className="text-danger" disabled={busy} onClick={() => { setError(null); remove.mutate(); }} />
      </div>
      {error && <ErrorBanner message={error} />}
    </li>
  );
}

/** Reels creators copied in the studio ("Copy a Reel") or made and saved: only their numbers are kept, never the video. Only the
 * administrator teaches the styles: each waits here until it is used (under a kind) or removed. */
function Suggestions() {
  const q = useQuery({ queryKey: ["style-suggestions"], queryFn: api.styleSuggestions });
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] text-muted">Reels people gave to “Match a Reel&apos;s Style” (Copied) and Reels they made and saved (Made &amp; saved). They never see this. Only the numbers are kept (pace, cuts, transitions, look), never the video. Pick the kind and tap Use to teach Shubix&apos;s styles with it, or remove it.</p>
      {q.isLoading && <Spinner size="sm" label="Loading…" />}
      {q.error && <ErrorBanner message={errorMessage(q.error)} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon="check" title="Nothing waiting" hint="New Reels from people show up here." />}
      {q.data && q.data.items.length > 0 && <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Reels from users">{q.data.items.map((s) => <SuggestionRow key={s.id} s={s} />)}</ul>}
      {q.data && q.data.total > q.data.items.length && <p className="m-0 text-[12px] text-muted">Showing the newest {q.data.items.length} of {q.data.total}.</p>}
    </div>
  );
}

/** One row of what could not be learned: what it looks like, how often, in how many Reels, and whether the studio has it */
function OddRow({ o }: { o: LearningOdd }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{o.guess}</span>
        {o.ours ? <Badge tone="neutral">Studio has it: {o.ours}</Badge> : <Badge tone="brand">New: not in the studio</Badge>}
        <span className="ml-auto text-muted">{o.n}× in {o.reels} Reel{o.reels === 1 ? "" : "s"}</span>
      </div>
      {o.looks.length > 0 && <span className="text-[12px] text-muted">Looks like: {o.looks.map((l) => `${l.sig} (${l.n})`).join(" · ")}</span>}
    </li>
  );
}

/** The learning log: for the Reels taught from many, how many transitions the reader knew, and apart from them the
 * transitions it does not know and the effects in a shot it does not learn (new ones, and ones the studio has). */
function LearningLogView() {
  const q = useQuery({ queryKey: ["learning-log"], queryFn: api.learningLog, refetchInterval: 15000 });
  const d = q.data;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] text-muted">Every Reel taught from “Learn a new trend → Many Reels”. Known: the transitions Shubix reads and learns. Not learned: what it saw but cannot learn yet, kept apart, so you see what the studio still lacks. Only the numbers are kept, never the video.</p>
      {q.isLoading && <Spinner size="sm" label="Loading…" />}
      {q.error && <ErrorBanner message={errorMessage(q.error)} />}
      {d && d.reels + d.failed === 0 && <EmptyState icon="trend" title="Nothing taught yet" hint="Teach from many Reels: each one shows up here." />}
      {d && d.reels + d.failed > 0 && (<>
        <div className="grid grid-cols-2 gap-2">
          <StatTile icon="video" label="Reels learned" value={d.reels} />
          <StatTile icon="close" label="Could not be read" value={d.failed} />
          <StatTile icon="check" label="Transitions known" value={d.cuts ? `${d.read} of ${d.cuts} (${Math.round((d.read / d.cuts) * 100)}%)` : "0"} />
          <StatTile icon="plus" label="Transitions not known" value={d.unreadCuts} />
        </div>
        <Heading size="section" as="h3">Transitions known</Heading>
        <p className="m-0 text-[12.5px] text-muted">{d.known.map((k) => `${k.kind} ${k.n}`).join(" · ") || "None yet"}</p>
        <Heading size="section" as="h3">Transitions not known</Heading>
        {d.newTransitions.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Transitions not known">{d.newTransitions.map((o) => <OddRow key={o.guess + o.ours} o={o} />)}</ul> : <p className="m-0 text-[12.5px] text-muted">None: every transition was read.</p>}
        <Heading size="section" as="h3">Effects in a shot not learned</Heading>
        {d.effects.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Effects not learned">{d.effects.map((o) => <OddRow key={o.guess + o.ours} o={o} />)}</ul> : <p className="m-0 text-[12.5px] text-muted">None seen.</p>}
        <Heading size="section" as="h3">Latest Reels</Heading>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]" aria-label="Latest Reels taught">
          {d.recent.map((r) => (
            <li key={r.category + r.name} className="flex flex-wrap gap-x-2 border-b border-border py-1.5">
              <span className="min-w-0 flex-1 truncate">{r.name}</span><span className="text-muted">{r.category}</span>
              <span className={r.ok ? "text-muted" : "text-danger"}>{r.ok ? `${r.cuts - r.unreadCuts}/${r.cuts} known${r.unreadCuts ? `, ${r.unreadCuts} not` : ""}${r.effects ? `, ${r.effects} effects` : ""}` : `not read: ${r.reason ?? ""}`}</span>
            </li>
          ))}
        </ul>
      </>)}
    </div>
  );
}

/** My trends (Admin → Tools → My trends, and /trends): what Shubix knows about each kind of Reel (taught from many
 * Reels, read on this device), the learning log, and the Reels people made or copied waiting to teach its styles.
 * Only these styles make Reels: a kind's style for its templates without the AI, and every kind's for Shubix AI. */
type Kinds = { categories: Record<string, { mine: number; shared: number }> };
const kindsNow = async (): Promise<Kinds> => {
  const r = await fetch("/api/studio/styles", { credentials: "same-origin" });
  if (!r.ok) throw new Error(`Could not read what Shubix knows (${r.status})`);
  return r.json();
};

export function TrendLibrary({ embedded = false }: { embedded?: boolean } = {}) {
  const q = useQuery({ queryKey: ["style-kinds"], queryFn: kindsNow });
  const waiting = useQuery({ queryKey: ["style-suggestions"], queryFn: api.styleSuggestions });
  const [panel, setPanel] = useState<"learn" | "users" | "log" | null>(null);
  const [startKind, setStartKind] = useState("wedding"), [teaching, setTeaching] = useState(false);
  const cats = q.data?.categories ?? {}, waitingN = waiting.data?.total ?? 0;
  // what every creator's Reels use: the shared Reels of each kind (the app's own Reels, and the ones taught here)
  const known = KINDS.map(([k, n]) => ({ k, n, reels: cats[k]?.shared ?? 0 }));
  const reels = known.reduce((a, x) => a + x.reels, 0), kindsOn = known.filter((x) => x.reels >= 2).length;
  const learn = (k: string) => { setStartKind(k); setPanel("learn"); };
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {!embedded && <PageHeader title="My trends" subtitle="Teach Shubix from real Reels: each kind's cuts, pace, transitions and look." />}
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <StatTile icon="trend" label="Kinds Shubix knows" value={`${kindsOn} of ${KINDS.length}`} />
        <StatTile icon="video" label="Reels learned" value={reels} />
        <StatTile icon="user" label="Waiting from users" value={waitingN} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => learn(startKind)} aria-haspopup="dialog"
          className="flex items-center gap-3 rounded-2xl border border-accent/50 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_14%,var(--surface)),var(--surface))] px-4 py-3.5 text-left shadow-[var(--shadow)] transition-colors hover:border-accent">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-on-accent [background:var(--gold-gradient)]"><Icon name="plus" size={19} /></span>
          <span className="min-w-0 flex-1"><Heading size="section" as="h2">Learn a new trend</Heading><span className="block truncate text-[12.5px] text-muted">Many Reels of a kind, read on this device</span></span>
          <Icon name="chevron" size={18} className="shrink-0 text-muted" />
        </button>
        <button type="button" onClick={() => setPanel("log")} aria-haspopup="dialog"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left shadow-[var(--shadow)] transition-colors hover:border-accent/60">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent"><Icon name="trend" size={19} /></span>
          <span className="min-w-0 flex-1"><Heading size="section" as="h2">Learning log</Heading><span className="block truncate text-[12.5px] text-muted">What was learned, and what could not be</span></span>
          <Icon name="chevron" size={18} className="shrink-0 text-muted" />
        </button>
        <button type="button" onClick={() => setPanel("users")} aria-haspopup="dialog"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left shadow-[var(--shadow)] transition-colors hover:border-accent/60">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent"><Icon name="user" size={19} /></span>
          <span className="min-w-0 flex-1"><Heading size="section" as="h2">Reels from users</Heading><span className="block truncate text-[12.5px] text-muted">Copied and made Reels waiting to teach</span></span>
          {waitingN > 0 && <Badge tone="brand">{waitingN} waiting</Badge>}
          <Icon name="chevron" size={18} className="shrink-0 text-muted" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2.5">
        <Heading>What Shubix knows</Heading>
        <span className="text-[12.5px] text-muted">Tap a kind to teach it more</span>
      </div>
      {q.isLoading && <Spinner size="sm" label="Reading what Shubix knows…" />}
      {q.error && <ErrorBanner message={errorMessage(q.error)} />}
      {q.data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {known.map(({ k, n, reels: r }) => (
            <button key={k} type="button" onClick={() => learn(k)} aria-label={`${n}: ${r} Reels learned. Teach more`}
              className="flex flex-col items-start gap-1 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left shadow-[var(--shadow)] transition-colors hover:border-accent/60">
              <span className="text-[13.5px] font-semibold">{n}</span>
              <span className="text-[12px] text-muted">{r ? `${r} Reel${r === 1 ? "" : "s"} learned` : "Nothing learned yet"}</span>
              {r < 2 && <Badge tone="neutral">Needs Reels</Badge>}
            </button>
          ))}
        </div>
      )}

      <SidePanel open={panel === "learn"} onClose={() => { if (!teaching) setPanel(null); }} title="Learn a new trend" where="My trends"><TeachForm onBusy={setTeaching} key={startKind} first={startKind} /></SidePanel>
      <SidePanel open={panel === "log"} onClose={() => setPanel(null)} title="Learning log" where="My trends"><LearningLogView /></SidePanel>
      <SidePanel open={panel === "users"} onClose={() => setPanel(null)} title="Reels from users" where="My trends" badge={waitingN ? <Badge tone="brand">{waitingN} waiting</Badge> : undefined}><Suggestions /></SidePanel>
    </div>
  );
}
