"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Heading, Input, Spinner, Toggle } from "@/components/atoms";
import { EmptyState, ErrorBanner, Field } from "@/components/molecules";
import { confirmAction } from "@/components/molecules/ConfirmDialog";
import { api, errorMessage, type SongSite, type SongSiteInput } from "@/lib/api";

/** Admin → Songs → Song sites: where the studio's "Get songs" sends people for a song (website and app), each opened in
 * a new tab. Shubix downloads nothing. Only places that are allowed: free songs with a licence for Reels, or Instagram /
 * charts to find a trending one (added in Instagram after exporting "Without the song"). Never a downloader site:
 * Google Play removes apps that lead to unlicensed downloads. */
const EMPTY: SongSiteInput = { name: "", note: "", url: "", free: true };
const okUrl = (u: string) => /^https:\/\/[^\s]+\.[^\s]+/.test(u.trim());

function SiteForm({ start, busy, label, onSave, onCancel }: { start: SongSiteInput; busy: boolean; label: string; onSave: (d: SongSiteInput) => void; onCancel?: () => void }) {
  const [v, setV] = useState(start);
  const ready = v.name.trim().length > 0 && okUrl(v.url);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Link (https://)"><Input value={v.url} maxLength={500} placeholder="https://" onChange={(e) => setV({ ...v, url: e.target.value })} /></Field>
      </div>
      <Field label="One line under its name"><Input value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle on={v.free} onChange={(free: boolean) => setV({ ...v, free })} label={v.free ? "Free to use (its songs may be used in Reels)" : "Trending (to find a song; added in Instagram)"} />
        <div className="ml-auto flex gap-2">
          {onCancel && <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>}
          <Button size="sm" disabled={!ready || busy} onClick={() => onSave({ ...v, name: v.name.trim(), note: v.note.trim(), url: v.url.trim() })}>{label}</Button>
        </div>
      </div>
    </div>
  );
}

export function SongSites() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "song-sites"], queryFn: api.adminSongSites });
  const [editing, setEditing] = useState<string | null>(null), [formKey, setFormKey] = useState(0);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "song-sites"] });
  const add = useMutation({ meta: { success: "Added", errorShown: true }, mutationFn: api.addSongSite, onSuccess: () => { setFormKey((k) => k + 1); refresh(); } });
  const save = useMutation({ meta: { success: "Saved", errorShown: true }, mutationFn: ({ id, d }: { id: string; d: Partial<SongSiteInput> }) => api.updateSongSite(id, d), onSuccess: () => { setEditing(null); refresh(); } });
  const del = useMutation({ meta: { success: "Deleted" }, mutationFn: api.deleteSongSite, onSuccess: refresh });
  const sites = list.data?.sites ?? [];
  const move = (s: SongSite, by: number) => { const i = sites.indexOf(s), o = sites[i + by]; if (!o) return; save.mutate({ id: s.id, d: { order: o.order } }); save.mutate({ id: o.id, d: { order: s.order } }); };
  return (
    <div className="grid gap-3">
      <Card className="grid gap-3">
        <Heading as="h3">Song sites</Heading>
        <p className="m-0 text-[13px] text-muted">Where the studio&apos;s <b>Get songs</b> sends people (website and app), each in a new tab. Shubix downloads nothing: they save the song and pick it with Add your song. Only allowed places: free songs with a licence for Reels, or Instagram and charts to find a trending song. Never a downloader site (Google Play removes apps that lead to them).</p>
        <SiteForm key={formKey} start={EMPTY} busy={add.isPending} label="Add the site" onSave={(d) => add.mutate(d)} />
      </Card>
      {list.isError && <ErrorBanner message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.isLoading && <Spinner />}
      {list.data && !sites.length && <EmptyState icon="music" title="No song sites" hint="Get songs shows nothing until one is added." />}
      {sites.map((s, i) => (
        <Card key={s.id} className="grid gap-2">
          {editing === s.id ? (
            <SiteForm start={{ name: s.name, note: s.note, url: s.url, free: s.free }} busy={save.isPending} label="Save" onCancel={() => setEditing(null)} onSave={(d) => save.mutate({ id: s.id, d })} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="flex items-center gap-2 text-[14px]">{s.name}<Badge>{s.free ? "Free to use" : "Trending"}</Badge></b>
                <div className="flex flex-wrap items-center gap-2">
                  <Toggle on={s.on} onChange={(on: boolean) => save.mutate({ id: s.id, d: { on } })} label="Shown" />
                  <Button size="sm" variant="secondary" disabled={i === 0} onClick={() => move(s, -1)} aria-label={`Move ${s.name} up`}>↑</Button>
                  <Button size="sm" variant="secondary" disabled={i === sites.length - 1} onClick={() => move(s, 1)} aria-label={`Move ${s.name} down`}>↓</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(s.id)}>Edit</Button>
                  <Button size="sm" variant="secondary" onClick={async () => { if (await confirmAction({ title: `Delete ${s.name}?`, body: "Get songs stops showing it.", ok: "Delete", danger: true })) del.mutate(s.id); }}>Delete</Button>
                </div>
              </div>
              {s.note && <span className="text-[12.5px] text-muted">{s.note}</span>}
              <a className="truncate text-[12px] text-accent" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
