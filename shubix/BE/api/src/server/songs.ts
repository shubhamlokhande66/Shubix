import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { probe } from "./core/ffmpeg";
import { mainDb, ObjectId, parseId } from "./core/db";
import { NotFoundError, ValidationFailed } from "./core/errors";
import { audioFacts } from "./media/probe";
import { readUpload } from "./media/upload";
import { localPath, mediaPath, moveFileAsync, keepLocalCopy } from "./storage/local";

/**
 * Shubix's song library: songs the administrator adds (Admin → Songs) with their licence, so a Reel can be made with no
 * song of the creator's ("Choose a song for me" in the studio picks one by the clips' energy). Only songs the business
 * may use in the Reels people post belong here (royalty-free with a licence that covers it, or bought for it); each
 * keeps its licence and where it came from, shown beside it. The files are kept like the Reels' (R2 when mounted).
 */

export const MOODS = ["energetic", "happy", "calm", "romantic", "emotional", "devotional", "cinematic", "festive"] as const;
export type Mood = (typeof MOODS)[number];
const MAX_BYTES = 25 * 1024 * 1024, EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i;

interface SongDoc { _id: ObjectId; name: string; artist: string; licence: string; source: string; moods: Mood[]; bpm: number | null; dur: number; size: number; key: string; type: string; on: boolean; createdAt: Date }
const songs = async () => (await mainDb()).collection<SongDoc>("song_library");
const out = (d: SongDoc) => ({ id: String(d._id), name: d.name, artist: d.artist, licence: d.licence, source: d.source, moods: d.moods, bpm: d.bpm, dur: d.dur, on: d.on, url: `/api/songs/${d._id}/file` });

export const SongFields = z.object({
  name: z.string().trim().min(1).max(80),
  artist: z.string().trim().max(80).default(""),
  licence: z.string().trim().min(3, "Say the licence (e.g. Pixabay Content License, or bought from …)").max(200),
  source: z.string().trim().max(300).default(""),
  moods: z.string().max(200).default("").transform((s) => [...new Set(s.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter((x): x is Mood => (MOODS as readonly string[]).includes(x)))]),
  bpm: z.string().max(6).default("").transform((s) => { const n = Number(s); return Number.isFinite(n) && n >= 40 && n <= 220 ? Math.round(n) : null; }),
});

/** Every song people can use (Admin sees the ones turned off too). */
export async function listSongs(all = false) {
  return (await (await songs()).find(all ? {} : { on: true }).sort({ createdAt: -1 }).limit(500).toArray()).map(out);
}

/** Admin → Songs: one uploaded song with its details. */
export async function addSong(req: Request) {
  const up = await readUpload(req, MAX_BYTES, 1);
  try {
    const f = up.files.find((x) => x.field === "file");
    if (!f) throw new ValidationFailed("Choose the song's file.", { code: "SONG_FILE" });
    if (!EXT.test(f.filename)) throw new ValidationFailed("A song is an MP3, M4A, AAC, WAV, OGG or FLAC file.", { code: "SONG_TYPE" });
    const p = SongFields.parse(up.fields), facts = audioFacts(await probe(f.tmp));
    if (facts.duration < 8 || facts.duration > 600) throw new ValidationFailed("A song from 8 seconds to 10 minutes.", { code: "SONG_LENGTH" });
    const id = new ObjectId(), key = `songs/${id}${path.extname(f.filename).toLowerCase()}`;
    fs.mkdirSync(path.dirname(localPath(key)), { recursive: true });
    await keepLocalCopy(f.tmp, key);
    await moveFileAsync(f.tmp, localPath(key));
    const doc: SongDoc = { _id: id, ...p, dur: facts.duration, size: f.size, key, type: f.mimeType || "audio/mpeg", on: true, createdAt: new Date() };
    await (await songs()).insertOne(doc);
    return out(doc);
  } finally { up.cleanup(); }
}

export async function setSong(id: string, on: boolean) {
  const r = await (await songs()).findOneAndUpdate({ _id: parseId(id, "Song") }, { $set: { on } }, { returnDocument: "after" });
  if (!r) throw new NotFoundError("Song not found.", { code: "SONG_NOT_FOUND" });
  return out(r);
}
export async function deleteSong(id: string) {
  const d = await (await songs()).findOneAndDelete({ _id: parseId(id, "Song") });
  if (!d) throw new NotFoundError("Song not found.", { code: "SONG_NOT_FOUND" });
  await fs.promises.rm(localPath(d.key), { force: true }).catch(() => {});
  return { ok: true };
}

/** The song's file (through the API: the studio's page reads it as its own, with no other site involved). */
export async function songFile(id: string) {
  const d = await (await songs()).findOne({ _id: parseId(id, "Song"), on: true });
  if (!d) throw new NotFoundError("Song not found.", { code: "SONG_NOT_FOUND" });
  const file = await mediaPath(d.key), stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) throw new NotFoundError("The song's file is missing.", { code: "SONG_FILE_MISSING" });
  const name = `${d.name}${d.artist ? ` - ${d.artist}` : ""}${path.extname(d.key)}`.replace(/[^\p{L}\p{N} .()-]/gu, "");
  return new Response(fs.readFileSync(file), { headers: { "content-type": d.type, "content-length": String(stat.size), "cache-control": "private, max-age=86400", "content-disposition": `inline; filename="${encodeURIComponent(name)}"` } });
}

/** Which song suits the clips: their energy (0 calm .. 1 action), the template's kind, the length wanted; never the
 * one used last; `seed` keeps one Reel's choice and gives the next Reel another. Pure, so both apps can use it. */
export function chooseSong<T extends { id: string; moods: string[]; bpm: number | null; dur: number }>(list: T[], o: { energy: number; kind?: string; minDur?: number; last?: string; seed: number }): T | null {
  const k = (o.kind || "").toLowerCase();
  const want = /wedding|love|engag/.test(k) ? ["romantic", "cinematic"] : /ganpati|puja|devot|temple/.test(k) ? ["devotional", "festive"] : /diwali|holi|navratri|festival|padwa|eid|christmas/.test(k) ? ["festive", "happy"]
    : /gym|sport|car|bike/.test(k) || o.energy > 0.6 ? ["energetic"] : o.energy < 0.3 ? ["calm", "cinematic", "emotional"] : ["happy", "energetic"];
  const ok = list.filter((s) => s.dur >= (o.minDur ?? 8) && s.id !== o.last);
  const pool = ok.length ? ok : list.filter((s) => s.id !== o.last).length ? list.filter((s) => s.id !== o.last) : list;
  if (!pool.length) return null;
  const score = (s: T) => s.moods.filter((m) => want.includes(m)).length * 2 + (s.bpm == null ? 0 : o.energy > 0.6 ? (s.bpm >= 110 ? 1 : 0) : o.energy < 0.3 ? (s.bpm <= 100 ? 1 : 0) : 0.5);
  const best = Math.max(...pool.map(score)), top = pool.filter((s) => score(s) === best);
  return top[Math.abs(Math.round(o.seed)) % top.length];
}
