"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Icon, IconButton, Spinner } from "@/components/atoms";
import { Dropzone } from "@/components/molecules/Dropzone";
import { ProgressBar } from "@/components/molecules/ProgressBar";
import { EmptyState, ErrorBanner, PageHeader, Segmented } from "@/components/molecules";
import { toast } from "@/lib/toast";
import { signInHere } from "@/lib/returnTo";
import { cutClip, fmt, keepForStudio, PART_SECONDS, probe, voiceParts } from "@/lib/clips/media";

/**
 * Vlog / Talking video (also Clips from a Video): one entry for talking videos. Up to 3 minutes of talking (one video,
 * or several clips): one Reel, made at once in the Talking Reel studio (pauses cut, captions, music). A longer video: its
 * best moments, each a Reel (below). A video of 45 s to 3 minutes can go either way.
 *
 * Clips from a Video (like Opus Clip): one long video (a podcast, a talk, a vlog, a class) in, its best moments out as
 * Reels. The voice is read on this phone part by part and transcribed (/api/studio/transcribe); Shubix finds the moments
 * that stand on their own (/api/studio/moments: a score, a title and a hook each). Every moment plays right here; "Make
 * Reel" cuts it out on the phone and opens it in the Talking Reel studio (pauses cut, captions, music, face framing);
 * "Download" saves the cut clip. The long video is never uploaded.
 */

type Word = { text: string; start: number; end: number };
type Moment = { start: number; end: number; text: string; score: number; title: string; hook: string; reason: string };
type Length = "short" | "medium" | "long";
type Stage = { label: string; pct: number } | null;

const LENGTHS: { value: Length; label: string }[] = [{ value: "short", label: "15–35 s" }, { value: "medium", label: "30–60 s" }, { value: "long", label: "55–90 s" }];
const LANGS = [["", "Auto"], ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["gu", "Gujarati"], ["ta", "Tamil"], ["te", "Telugu"], ["bn", "Bengali"]] as const;
const MAX_MINUTES = 120, ONE_REEL_MAX = 180;   // one Reel: up to 3 minutes of talking (its captions are read in one part)
type Way = "one" | "many";

async function api<T>(url: string, init: RequestInit, signal: AbortSignal): Promise<T> {
  for (let n = 1; ; n++) {
    let r: Response | null = null;
    try { r = await fetch(url, { ...init, signal }); } catch (e) { if ((e as Error).name === "AbortError") throw e; }
    if (r && (r.ok || !(r.status === 408 || r.status === 429 || r.status >= 500) || n >= 3)) {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Something went wrong (${r.status}). Please try again.`), { status: r.status, code: j?.error?.code });
      return j as T;
    }
    if (!r && n >= 3) throw new Error("No connection. Check your internet and try again.");
    await new Promise((ok) => setTimeout(ok, 1500 * n));
  }
}

// phones: the main button at the bottom of the screen, as on every Create screen
const BOTTOM = "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:border-t max-lg:border-border max-lg:bg-background max-lg:px-4 max-lg:pt-2.5 max-lg:pb-[max(10px,env(safe-area-inset-bottom))] max-lg:[&>button]:h-[52px] max-lg:[&>button]:rounded-2xl";
const isVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name);
const scoreTone = (s: number) => (s >= 80 ? "text-emerald-600" : s >= 60 ? "text-accent" : "text-muted");

export function ClipsFinder() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const [meta, setMeta] = useState<{ duration: number; audio: boolean } | null>(null);
  const [way, setWay] = useState<Way>("one");
  const [length, setLength] = useState<Length>("medium");
  const [count, setCount] = useState(6);
  const [lang, setLang] = useState("");
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Moment[] | null>(null);
  const [by, setBy] = useState<"ai" | "simple" | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [cutPct, setCutPct] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const words = useRef<{ key: string; words: Word[] } | null>(null);
  const ac = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => ac.current?.abort(), []);
  const key = file ? `${file.name}|${file.size}|${file.lastModified}` : "";

  async function pick(fs: File[]) {
    ac.current?.abort(); setClips(null); setError(null); setMeta(null); setBy(null); words.current = null; setFiles(fs);
    try {
      const all = await Promise.all(fs.map((f) => probe(f)));
      const m = { duration: all.reduce((a, x) => a + x.duration, 0), audio: all.some((x) => x.audio) };
      // up to 3 minutes: one Reel at once; longer: its best moments (one video only: several clips over 3 minutes are too
      // long for one Reel and are not one talk to cut into moments)
      if (!m.audio) setError("These videos have no sound. Pick a video where someone talks (a vlog, a tutorial, a review).");
      else if (fs.length > 1 && m.duration > ONE_REEL_MAX) setError(`These clips are ${fmt(m.duration)} in all: one Reel takes up to 3 minutes of talking. Pick fewer clips, or one long video to cut into several Reels.`);
      else if (m.duration > MAX_MINUTES * 60) setError(`This video is ${Math.round(m.duration / 60)} minutes long. Pick one up to ${MAX_MINUTES} minutes.`);
      setWay(m.duration <= ONE_REEL_MAX ? "one" : "many");
      setMeta(m);
    } catch { setError("This video could not be read in this browser. Try an MP4 or MOV, in Chrome or Edge."); }
  }
  // one Reel of the whole talk: the clips go to the Talking Reel studio as they are, and it is made at once
  async function oneReel() {
    if (!files.length) return;
    setBusy(-1);
    try {
      await keepForStudio(files);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the studio needs a full load (isolated page)
      location.assign("/create/talking?from=clips");
    } catch (e) { setError((e as Error).message || "The videos could not be handed to the studio. Please try again."); setBusy(null); }
  }
  const canOne = !!meta && meta.duration <= ONE_REEL_MAX, canMany = !!meta && files.length === 1 && meta.duration >= 45;

  async function find() {
    if (!file || !meta) return;
    ac.current?.abort();
    const ctl = new AbortController(); ac.current = ctl;
    setError(null); setClips(null);
    try {
      // 1. the words (once per video and language: changing the length or the number does not read it again)
      const wkey = `${key}|${lang}`;
      if (words.current?.key !== wkey) {
        const all: Word[] = [], parts = Math.max(1, Math.ceil(meta.duration / PART_SECONDS));
        let done = 0;
        setStage({ label: "Listening to the video…", pct: 2 });
        for await (const part of voiceParts(file, ctl.signal)) {
          const r = await api<{ words: Word[] }>(`/api/studio/transcribe?lang=${encodeURIComponent(lang)}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: part.wav }, ctl.signal);
          for (const w of r.words ?? []) all.push({ text: w.text, start: +(w.start + part.from).toFixed(2), end: +(w.end + part.from).toFixed(2) });
          done++;
          setStage({ label: `Listening to the video… ${fmt(part.to)} of ${fmt(meta.duration)}`, pct: 2 + (done / parts) * 78 });
        }
        if (all.length < 20) throw new Error("Hardly any talking was found in this video. Clips are found from what people say.");
        words.current = { key: wkey, words: all };
      }
      // 2. the moments
      setStage({ label: "Shubix AI is finding the best moments…", pct: 85 });
      const r = await api<{ clips: Moment[]; by: "ai" | "simple"; charged: number }>("/api/studio/moments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: words.current.words, duration: meta.duration, length, count, key }),
      }, ctl.signal);
      setStage(null); setClips(r.clips); setBy(r.by);
      if (!r.clips.length) setError("No moment of this length stands on its own. Try another length.");
    } catch (e) {
      setStage(null);
      if ((e as Error).name === "AbortError") return;
      const st = (e as { status?: number }).status;
      if (st === 401) return signInHere(() => void find());   // signed in, it goes on by itself
      setError(st === 402 || st === 403 ? (e as Error).message || "Clips from a Video is part of the Editor and Pro plans." : (e as Error).message);
    }
  }

  function play(i: number) {
    const v = video.current, c = clips?.[i];
    if (!v || !c) return;
    if (playing === i && !v.paused) { v.pause(); setPlaying(null); return; }
    v.currentTime = c.start; void v.play(); setPlaying(i);
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  useEffect(() => {
    const v = video.current;
    if (!v || playing === null || !clips) return;
    const end = clips[playing].end;
    const tick = () => { if (v.currentTime >= end) { v.pause(); setPlaying(null); } };
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, [playing, clips]);

  async function use(i: number, how: "studio" | "download") {
    const c = clips?.[i];
    if (!file || !c || busy !== null) return;
    video.current?.pause(); setPlaying(null);
    setBusy(i); setCutPct(0);
    try {
      const out = await cutClip(file, c.start, c.end, (p) => setCutPct(Math.round(p * 100)));
      if (how === "download") {
        const a = document.createElement("a"); a.href = URL.createObjectURL(out); a.download = out.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
        toast.success("Clip saved");
      } else {
        await keepForStudio(out);
        // the studio is a full page load (its own isolated page); the clip waits for it in this browser
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the studio needs a full load (isolated page)
        location.assign("/create/talking?from=clips");
        return;
      }
    } catch (e) {
      setError((e as Error).message || "The clip could not be cut. Please try again.");
    }
    setBusy(null);
  }

  const another = () => { ac.current?.abort(); setFiles([]); setClips(null); setError(null); setStage(null); };
  const working = !!stage;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pb-24 md:px-0">
      <div className="max-lg:hidden">
        <PageHeader title="Vlog / Talking video" subtitle="Your talking video in, Reels out: pauses cut, captions and music. A long one is cut into its best moments." />
      </div>
      {/* phones: as the other kinds of Reel (the Create flow): where you are, Back and the title */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-muted lg:hidden"><Link href="/">Home</Link><span aria-hidden>›</span><span aria-current="page" className="font-semibold text-foreground">Vlog / Talking video</span></nav>
      <div className="flex items-center gap-3 lg:hidden">
        <IconButton icon="back" label="Back" onClick={() => (file ? another() : window.history.length > 1 ? router.back() : router.push("/"))} className="rounded-full" />
        <b className="font-display text-[18px] font-semibold">{file ? "Make your Reel" : "Add your talking video"}</b>
      </div>

      {!file ? (
        <>
        <div className="max-lg:hidden">
        <Dropzone label="Choose your talking video" hint={`A vlog, tutorial, review or podcast · one long video (up to ${MAX_MINUTES} minutes) or a few clips · it stays on your phone`} accept="video/*" multiple
          validate={isVideo} onFiles={(f) => f.length && void pick(f)} onReject={() => setError("That is not a video. Pick an MP4, MOV or WebM.")} />
        </div>
        <div className="grid justify-items-center gap-3 pt-1 text-center lg:hidden">
          <span className="grid size-[76px] place-items-center rounded-[22px] bg-gold text-on-accent shadow-[0_0_0_10px_color-mix(in_srgb,var(--accent)_12%,transparent),0_18px_40px_-16px_var(--brand-glow)]"><Icon name="mic" size={40} /></span>
          <h2 className="m-0 mt-2 font-display text-[25px] font-semibold tracking-[-.02em]">Create a Talking Reel</h2>
          <p className="m-0 max-w-[32ch] text-[14.5px] text-muted">Your talking video in, Reels out: pauses cut, captions and music.</p>
        </div>
        <label className="grid min-h-[148px] cursor-pointer place-items-center content-center gap-2 rounded-[20px] border-2 border-dashed border-accent/65 bg-accent/10 p-5 text-center focus-within:outline-2 focus-within:outline-accent lg:hidden">
          <span className="grid size-[54px] place-items-center rounded-2xl bg-gold text-on-accent"><Icon name="upload" size={26} /></span>
          <b className="text-[17px]">Add your talking video</b>
          <small className="text-[12.5px] text-muted">One long video (up to {MAX_MINUTES} minutes) or a few clips</small>
          <input type="file" accept="video/*" multiple className="sr-only" onChange={(e) => {
            const all = [...(e.target.files ?? [])], fs = all.filter(isVideo);
            e.target.value = "";
            if (fs.length) void pick(fs); else if (all.length) setError("That is not a video. Pick an MP4, MOV or WebM.");
          }} />
        </label>
        <ul className="m-0 grid list-none gap-3 p-0 px-1.5 lg:hidden">
          {["Up to 3 minutes: one Reel at once", "Longer: its best moments, each a Reel", "Pauses cut, captions added", "Preview, make changes and export"].map((t) => (
            <li key={t} className="flex items-center gap-3 text-[15px] font-semibold"><span className="grid size-6 flex-none place-items-center rounded-full bg-accent text-white"><Icon name="check" size={14} stroke={3} /></span>{t}</li>
          ))}
        </ul>
        </>
      ) : (
        <Card className="grid gap-3">
          <video ref={video} src={url} controls playsInline preload="metadata" className="max-h-[52vh] w-full rounded-xl bg-black" />
          {!meta && !error && <Spinner size="sm" label="Reading your video…" />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
            <span className="min-w-0 truncate font-medium text-foreground">{files.length > 1 ? `${files.length} clips` : file.name}{meta && ` · ${fmt(meta.duration)}`}</span>
            <Button variant="secondary" size="sm" icon="refresh" disabled={working || busy !== null} onClick={another}>Another video</Button>
          </div>
        </Card>
      )}

      {file && meta?.audio && canOne && canMany && (
        <Segmented label="What to make" options={[{ value: "one", label: "One Reel of it all" }, { value: "many", label: "Several Reels from it" }]} value={way} onChange={(v: Way) => setWay(v)} />
      )}

      {file && meta?.audio && canOne && way === "one" && (
        <Card className="grid gap-2">
          <p className="m-0 text-[13px] text-muted">The whole talk becomes one Reel: the pauses cut, captions of what is said, quiet music, your face kept in the frame.</p>
          <div className={BOTTOM}><Button icon="sparkle" full loading={busy === -1} disabled={busy !== null} onClick={() => void oneReel()}>Make the Reel</Button></div>
        </Card>
      )}

      {file && meta?.audio && canMany && way === "many" && (
        <Card className="grid gap-3">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold">Clip length</span>
            <Segmented label="Clip length" options={LENGTHS} value={length} onChange={setLength} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="grid gap-1.5 text-[13px] font-semibold">How many
              <select className="rounded-lg border border-border bg-surface px-3 py-2 font-normal" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={working}>
                {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} clips</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Language spoken
              <select className="rounded-lg border border-border bg-surface px-3 py-2 font-normal" value={lang} onChange={(e) => setLang(e.target.value)} disabled={working}>
                {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          {stage ? (
            <div className="grid gap-2">
              <ProgressBar value={stage.pct} label={stage.label} showEta />
              <Button variant="secondary" size="sm" onClick={() => { ac.current?.abort(); setStage(null); }}>Stop</Button>
            </div>
          ) : (
            <div className={BOTTOM}><Button icon="sparkle" full onClick={() => void find()} disabled={!meta || busy !== null || meta.duration > MAX_MINUTES * 60}>
              {clips ? "Find again" : "Find the best clips"}
            </Button></div>
          )}
        </Card>
      )}

      {error && <ErrorBanner message={error} onRetry={file && meta?.audio && !stage && way === "many" && canMany ? () => void find() : undefined} />}

      {clips && clips.length > 0 && (
        <section className="grid gap-3" aria-label="Clips found">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[19px] font-semibold">{clips.length} clips, best first</h2>
            <Badge>{by === "ai" ? "Picked by Shubix AI" : "Quick picks"}</Badge>
          </div>
          {clips.map((c, i) => (
            <Card key={`${c.start}-${c.end}`} className="grid gap-2">
              <div className="flex items-start gap-3">
                <div className="grid w-14 flex-none place-items-center rounded-xl border border-border py-1.5 text-center">
                  <span className={`text-[20px] font-bold leading-none ${scoreTone(c.score)}`}>{c.score}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">score</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug">{c.title}</div>
                  <div className="text-[12.5px] text-muted">{fmt(c.start)}–{fmt(c.end)} · {Math.round(c.end - c.start)} s</div>
                  {c.hook && c.hook !== c.title && <div className="mt-1 text-[13px]"><span className="text-muted">Hook: </span>“{c.hook}”</div>}
                  {c.reason && <div className="mt-0.5 text-[12.5px] text-muted">{c.reason}</div>}
                </div>
              </div>
              <p className="line-clamp-3 text-[13px] text-muted">{c.text}</p>
              {busy === i ? <ProgressBar value={cutPct} label="Cutting the clip…" size="sm" /> : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={playing === i ? "pause" : "play"} onClick={() => play(i)}>{playing === i ? "Pause" : "Play"}</Button>
                  <Button size="sm" icon="sparkle" disabled={busy !== null} onClick={() => void use(i, "studio")}>Make Reel</Button>
                  <Button size="sm" variant="secondary" icon="download" disabled={busy !== null} onClick={() => void use(i, "download")}>Download</Button>
                </div>
              )}
            </Card>
          ))}
        </section>
      )}

      {!file && (
        <div className="max-lg:hidden"><EmptyState icon="mic" title="How it works" hint="Up to 3 minutes of talking: one Reel at once (pauses cut, captions, music). A longer video: Shubix listens, finds the moments that work on their own, gives each a score, a title and a hook; play it, make it a Reel or download it." /></div>
      )}
      <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon name="lock" size={14} /> Your video stays on this device. Only its sound is sent, to find the words.</p>
    </div>
  );
}
