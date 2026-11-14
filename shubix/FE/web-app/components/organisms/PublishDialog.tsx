"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Icon, Spinner } from "@/components/atoms";
import { ErrorBanner, SidePanel } from "@/components/molecules";
import { toast } from "@/lib/toast";
import { cancelPost, connectUrl, disconnect, getSocial, PLATFORM_NAME, publish, writeCaption, type Platform, type SocialPlatform, type SocialPost } from "@/lib/social";

/**
 * Publish a saved Reel to the person's own Instagram (Reel) and YouTube (Short), now or at a time, with a caption Shubix
 * AI can write; below, the Reel's posts with their state and, once up, their views, likes and comments (refreshed every
 * 30 minutes). While a post is being published the panel asks every 4 s (that also moves the work on).
 */

const n = (x?: number) => (x === undefined ? "–" : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : String(x));
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const STATUS: Record<SocialPost["status"], { label: string; tone: "neutral" | "success" | "danger" | "brand" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" }, working: { label: "Publishing…", tone: "brand" }, published: { label: "Published", tone: "success" }, failed: { label: "Failed", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

export function PublishDialog({ reel, onClose }: { reel: { id: string; name: string; dur?: number } | null; onClose: () => void }) {
  const [platforms, setPlatforms] = useState<SocialPlatform[] | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [pick, setPick] = useState<Platform[]>([]);
  const [title, setTitle] = useState(reel?.name ?? "");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() => local(new Date(Date.now() + 2 * 3600_000)));
  const [busy, setBusy] = useState<"" | "post" | "ai">("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const s = await getSocial(); setPlatforms(s.platforms); setPosts(s.posts); setError(null); return s; }
    catch (e) { setError((e as Error).message); return null; }
  }, []);
  // (one panel per Reel: the parent gives it the Reel's id as its key, so the form starts fresh for each)
  useEffect(() => {
    if (!reel) return;
    let live = true;
    getSocial().then((s) => { if (!live) return; setPlatforms(s.platforms); setPosts(s.posts); setPick(s.platforms.filter((p) => p.connected).map((p) => p.id)); })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [reel]);
  const mine = posts.filter((p) => reel && p.reelId === reel.id);
  useEffect(() => {
    const moving = mine.some((p) => p.status === "working" || (p.status === "scheduled" && new Date(p.at).getTime() <= Date.now() + 60_000));
    if (!reel || !moving) return;
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }, [reel, mine, load]);

  async function go() {
    if (!reel || !pick.length) return;
    setBusy("post"); setError(null);
    try {
      const time = when === "later" ? new Date(at) : null;
      if (time && time.getTime() < Date.now() + 5 * 60_000) throw new Error("Choose a time at least 5 minutes from now.");
      await publish({ reelId: reel.id, platforms: pick, caption, title, at: time ? time.toISOString() : null });
      toast.success(time ? "Scheduled" : "Publishing started");
      await load();
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  }
  async function ai() {
    if (!reel) return;
    const about = [title, caption].filter(Boolean).join(". ").trim() || reel.name;
    setBusy("ai"); setError(null);
    try { const r = await writeCaption(about, pick[0] ?? "instagram"); setTitle(r.title || title); setCaption(r.caption); }
    catch (e) { setError((e as Error).message); }
    setBusy("");
  }

  const connected = platforms?.filter((p) => p.connected) ?? [];
  return (
    <SidePanel open={!!reel} onClose={onClose} title="Publish" where={reel?.name}>
      <div className="grid gap-4">
        {!platforms && !error && <Spinner />}
        {platforms && (
          <section className="grid gap-2" aria-label="Accounts">
            {platforms.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
                {p.connected ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={pick.includes(p.id)} onChange={(e) => setPick((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))} />
                    <span className="min-w-0"><b className="block text-[13.5px]">{PLATFORM_NAME[p.id]}</b><span className="block truncate text-[12px] text-muted">{p.name}{p.needsReconnect ? " · connect again" : ""}</span></span>
                  </label>
                ) : (
                  <span className="min-w-0 flex-1"><b className="block text-[13.5px]">{PLATFORM_NAME[p.id]}</b><span className="block text-[12px] text-muted">{p.ready ? "Not connected" : "Not available on this server yet"}</span></span>
                )}
                {p.ready && (!p.connected || p.needsReconnect) && <Button size="sm" href={connectUrl(p.id)} reload>Connect</Button>}
                {p.connected && <Button size="sm" variant="secondary" onClick={() => void disconnect(p.id).then(load)}>Disconnect</Button>}
              </div>
            ))}
            {!connected.length && <p className="m-0 text-[12px] text-muted">Instagram needs a Business or Creator account. YouTube posts it as a Short (vertical, up to 3 minutes).</p>}
          </section>
        )}

        {connected.length > 0 && (
          <section className="grid gap-2.5" aria-label="Post">
            <label className="grid gap-1 text-[13px] font-semibold">Title (YouTube)
              <input className="rounded-lg border border-border bg-surface px-3 py-2 font-normal" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="grid gap-1 text-[13px] font-semibold">Caption
              <textarea className="min-h-28 rounded-lg border border-border bg-surface px-3 py-2 font-normal" maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What is this Reel about? Hashtags at the end…" />
            </label>
            <Button size="sm" variant="secondary" icon="sparkle" loading={busy === "ai"} disabled={!!busy} onClick={() => void ai()}>Write it with Shubix AI</Button>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <label className="flex items-center gap-1.5"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Now</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} /> Schedule</label>
              {when === "later" && <input type="datetime-local" className="rounded-lg border border-border bg-surface px-2 py-1.5" value={at} min={local(new Date())} onChange={(e) => setAt(e.target.value)} />}
            </div>
            <Button icon="send" full loading={busy === "post"} disabled={!!busy || !pick.length} onClick={() => void go()}>{when === "later" ? "Schedule" : "Publish now"}</Button>
          </section>
        )}

        {error && <ErrorBanner message={error} />}

        {mine.length > 0 && (
          <section className="grid gap-2" aria-label="Posts of this Reel">
            <b className="text-[13.5px]">This Reel&apos;s posts</b>
            {mine.map((p) => (
              <div key={p.id} className="grid gap-1 rounded-xl border border-border p-2.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <b>{PLATFORM_NAME[p.platform]}</b>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                </div>
                <span className="text-muted">{p.status === "scheduled" ? `Goes out ${new Date(p.at).toLocaleString()}` : p.step || p.error}</span>
                {p.stats && <span className="flex gap-3"><span><Icon name="eye" size={13} /> {n(p.stats.views)}</span><span><Icon name="heart" size={13} /> {n(p.stats.likes)}</span><span><Icon name="chat" size={13} /> {n(p.stats.comments)}</span></span>}
                <div className="flex gap-2">
                  {p.url && <a className="font-semibold text-accent" href={p.url} target="_blank" rel="noreferrer">Open</a>}
                  {p.status === "scheduled" && p.platform === "instagram" && <button type="button" className="font-semibold text-danger" onClick={() => void cancelPost(p.id).then(load).catch((e) => setError((e as Error).message))}>Cancel</button>}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </SidePanel>
  );
}
