import { z } from "zod";
import { mainDb, ObjectId, parseId } from "./core/db";
import { NotFoundError } from "./core/errors";

/**
 * Get songs: the places the studio's "Get songs" sends people to for a song (Admin → Songs → Song sites), each opened
 * in a new tab. Shubix downloads nothing: the person saves the song on their device and picks it with Add your song.
 * Only places that are allowed belong here: free songs with a licence for Reels, or Instagram / charts to find a
 * trending one (added in Instagram, where it is licensed, after exporting "Without the song"). No downloader sites:
 * Google Play removes apps that lead to unlicensed downloads.
 */
interface SiteDoc { _id: ObjectId; name: string; note: string; url: string; free: boolean; on: boolean; order: number; createdAt: Date }
const sites = async () => (await mainDb()).collection<SiteDoc>("song_sites");
const out = (d: SiteDoc) => ({ id: String(d._id), name: d.name, note: d.note, url: d.url, free: d.free, on: d.on, order: d.order });
export type SongSite = ReturnType<typeof out>;

export const SiteFields = z.object({
  name: z.string().trim().min(1).max(60),
  note: z.string().trim().max(200).default(""),
  url: z.string().trim().max(500).url().refine((u) => u.startsWith("https://"), "A link that starts with https://"),
  free: z.boolean().default(false),
  on: z.boolean().default(true),
  order: z.number().int().min(0).max(999).optional(),
});

// the first list, put in the database once (the administrator changes or removes them from there)
const FIRST: Omit<SiteDoc, "_id" | "createdAt">[] = [
  { name: "Instagram trending", url: "https://www.instagram.com/explore/search/keyword/?q=trending%20reels", free: false, on: true, order: 0,
    note: "Find a trending Reel and its song. Use your own copy of it here, then export \"Without the song\" and add the song in Instagram." },
  { name: "YouTube trending songs", url: "https://charts.youtube.com/charts/TopSongs/in/weekly", free: false, on: true, order: 1,
    note: "See what is trending this week in India. Add the song in Instagram after you export." },
  { name: "Pixabay Music", url: "https://pixabay.com/music/", free: true, on: true, order: 2, note: "Free songs for Reels, no sign-in. Download, come back, tap Add your song." },
  { name: "Uppbeat", url: "https://uppbeat.io/", free: true, on: true, order: 3, note: "Free songs made for creators (free account)." },
  { name: "Free Music Archive", url: "https://freemusicarchive.org/", free: true, on: true, order: 4, note: "Free songs by independent artists. Check each song's licence." },
  { name: "YouTube Audio Library", url: "https://studio.youtube.com/channel/UC/music", free: true, on: true, order: 5, note: "Free songs and sounds (sign in with your YouTube channel)." },
];
let seeded: Promise<void> | null = null;
function seedOnce() {
  return seeded ??= (async () => {
    const db = await mainDb(), mark = db.collection<{ _id: string; at: Date }>("seeds");
    if (await mark.findOne({ _id: "song_sites" })) return;
    const c = await sites();
    if (!(await c.countDocuments())) await c.insertMany(FIRST.map((s) => ({ ...s, _id: new ObjectId(), createdAt: new Date() })));
    await mark.updateOne({ _id: "song_sites" }, { $set: { at: new Date() } }, { upsert: true });
  })().catch((e) => { seeded = null; throw e; });
}

/** The places people see (Admin sees the ones turned off too), in the administrator's order. */
export async function listSongSites(all = false) {
  await seedOnce();
  return (await (await sites()).find(all ? {} : { on: true }).sort({ order: 1, createdAt: 1 }).limit(50).toArray()).map(out);
}
export async function addSongSite(input: unknown) {
  await seedOnce();
  const p = SiteFields.parse(input), c = await sites();
  const order = p.order ?? ((await c.find().sort({ order: -1 }).limit(1).next())?.order ?? -1) + 1;
  const doc: SiteDoc = { _id: new ObjectId(), ...p, order, createdAt: new Date() };
  await c.insertOne(doc);
  return out(doc);
}
export async function updateSongSite(id: string, input: unknown) {
  const p = SiteFields.partial().parse(input);
  const r = await (await sites()).findOneAndUpdate({ _id: parseId(id, "Song site") }, { $set: p }, { returnDocument: "after" });
  if (!r) throw new NotFoundError("Song site not found.", { code: "SONG_SITE_NOT_FOUND" });
  return out(r);
}
export async function deleteSongSite(id: string) {
  const d = await (await sites()).findOneAndDelete({ _id: parseId(id, "Song site") });
  if (!d) throw new NotFoundError("Song site not found.", { code: "SONG_SITE_NOT_FOUND" });
  return { ok: true };
}
