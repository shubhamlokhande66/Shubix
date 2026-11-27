"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Heading, Input, Spinner, Toggle } from "@/components/atoms";
import { EmptyState, ErrorBanner, Field } from "@/components/molecules";
import { ProgressBar } from "@/components/molecules/ProgressBar";
import { confirmAction } from "@/components/molecules/ConfirmDialog";
import { api, errorMessage } from "@/lib/api";
import { SongSites } from "./SongSites";

/** Admin → Songs: Shubix's song library. A Reel can be made with one of these when the creator has no song ("Choose a
 * song for me" in the studio picks by the clips' energy and these moods). Only songs the business may use in the Reels
 * people post: each needs its licence (and where it came from), shown beside it. */

const MOODS = ["energetic", "happy", "calm", "romantic", "emotional", "devotional", "cinematic", "festive"];
const EMPTY = { name: "", artist: "", licence: "", source: "", moods: "", bpm: "" };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function SongsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "songs"], queryFn: api.adminSongs });
  const [file, setFile] = useState<File | null>(null), [v, setV] = useState(EMPTY), [moods, setMoods] = useState<string[]>([]), [pct, setPct] = useState(0);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "songs"] });
  const add = useMutation({ meta: { success: "Song added", errorShown: true },
    mutationFn: () => api.addSong(file!, { ...v, moods: moods.join(",") }, (f) => setPct(Math.round(f * 100))),
    onSuccess: () => { setFile(null); setV(EMPTY); setMoods([]); setPct(0); refresh(); } });
  const flip = useMutation({ mutationFn: ({ id, on }: { id: string; on: boolean }) => api.setSong(id, on), onSuccess: refresh });
  const del = useMutation({ meta: { success: "Deleted" }, mutationFn: api.deleteSong, onSuccess: refresh });
  const ready = !!file && v.name.trim().length > 0 && v.licence.trim().length >= 3 && moods.length > 0;
  return (
    <div className="grid gap-5">
      <Card className="grid gap-3">
        <Heading as="h3">Add a song</Heading>
        <p className="m-0 text-[13px] text-muted">Only songs Shubix may use in the Reels people post: royalty-free with a licence that allows it, or bought for it. Write the licence and where it came from.</p>
        <Field label="The file (MP3, M4A, WAV, OGG, FLAC; up to 25 MB)"><input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Artist"><Input value={v.artist} maxLength={80} onChange={(e) => setV({ ...v, artist: e.target.value })} /></Field>
          <Field label="Licence"><Input value={v.licence} maxLength={200} placeholder="e.g. Pixabay Content License" onChange={(e) => setV({ ...v, licence: e.target.value })} /></Field>
          <Field label="Where it came from (link)"><Input value={v.source} maxLength={300} onChange={(e) => setV({ ...v, source: e.target.value })} /></Field>
          <Field label="Beats a minute (optional)"><Input value={v.bpm} maxLength={3} inputMode="numeric" onChange={(e) => setV({ ...v, bpm: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <Field label="Moods (the studio picks by these)">
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => <Button key={m} size="sm" variant={moods.includes(m) ? "primary" : "secondary"} onClick={() => setMoods((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]))}>{m}</Button>)}
          </div>
        </Field>
        {add.isPending ? <ProgressBar value={pct} label="Uploading…" /> : <Button icon="upload" disabled={!ready} onClick={() => add.mutate()}>Add the song</Button>}
      </Card>

      {list.isError && <ErrorBanner message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.isLoading && <Spinner />}
      {list.data && !list.data.songs.length && <EmptyState icon="music" title="No songs yet" hint="Add songs here: the studio's Choose a song for me picks from them." />}
      {list.data && list.data.songs.length > 0 && (
        <section className="grid gap-2" aria-label="Songs">
          {list.data.songs.map((s) => (
            <Card key={s.id} className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[14px]">{s.name}{s.artist ? ` · ${s.artist}` : ""}</b>
                <div className="flex items-center gap-2">
                  <Toggle on={s.on} onChange={(on: boolean) => flip.mutate({ id: s.id, on })} label="Offered" />
                  <Button size="sm" variant="secondary" onClick={async () => { if (await confirmAction({ title: `Delete ${s.name}?`, body: "Its file is deleted too. Reels already made keep their sound.", ok: "Delete", danger: true })) del.mutate(s.id); }}>Delete</Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                <span>{clock(s.dur)}</span>{s.bpm && <span>· {s.bpm} BPM</span>}{s.moods.map((m) => <Badge key={m}>{m}</Badge>)}
              </div>
              <span className="text-[12px] text-muted">Licence: {s.licence}{s.source ? <> · <a className="text-accent" href={s.source} target="_blank" rel="noreferrer">source</a></> : null}</span>
              <audio controls preload="none" src={s.url} className="w-full" />
            </Card>
          ))}
        </section>
      )}
      <SongSites />
    </div>
  );
}
