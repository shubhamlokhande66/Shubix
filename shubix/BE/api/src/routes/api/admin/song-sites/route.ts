import { requireAdmin } from "../../../../server/core/admin";
import { route } from "../../../../server/core/http";
import { addSongSite, listSongSites } from "../../../../server/songSites";

/** Admin → Songs → Song sites: every place (turned off too), and a new one ({ name, note, url, free, on, order }). */
export const GET = route(async (req) => { await requireAdmin(req); return { sites: await listSongSites(true) }; });
export const POST = route(async (req) => { await requireAdmin(req); return Response.json(await addSongSite(await req.json().catch(() => ({}))), { status: 201 }); });
