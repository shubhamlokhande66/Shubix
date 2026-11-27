import { requireAdmin } from "../../../../../server/core/admin";
import { route } from "../../../../../server/core/http";
import { deleteSongSite, updateSongSite } from "../../../../../server/songSites";

/** Admin → Songs → Song sites: one place changed (any of its fields, on / off, its order), or deleted. */
export const PATCH = route<{ id: string }>(async (req, { id }) => { await requireAdmin(req); return updateSongSite(id, await req.json().catch(() => ({}))); });
export const DELETE = route<{ id: string }>(async (req, { id }) => { await requireAdmin(req); return deleteSongSite(id); });
