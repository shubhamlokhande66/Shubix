import { route } from "../../../server/core/http";
import { listSongSites } from "../../../server/songSites";

/** Get songs: where the studio sends people for a song (Admin → Songs → Song sites). */
export const GET = route(async () => ({ sites: await listSongSites() }));
