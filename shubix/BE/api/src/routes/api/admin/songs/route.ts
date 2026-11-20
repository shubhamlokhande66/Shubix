import { requireAdmin } from "../../../../server/core/admin";
import { route } from "../../../../server/core/http";
import { addSong, listSongs } from "../../../../server/songs";

/** Admin → Songs: every song (turned off too), and a new one (multipart: file, name, artist, licence, source, moods, bpm). */
export const GET = route(async (req) => { await requireAdmin(req); return { songs: await listSongs(true) }; });
export const POST = route(async (req) => { await requireAdmin(req); return Response.json(await addSong(req), { status: 201 }); });
