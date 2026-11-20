import { route } from "../../../server/core/http";
import { listSongs } from "../../../server/songs";

/** Shubix's song library (Admin → Songs): the songs a Reel can be made with, each with its licence. */
export const GET = route(async () => ({ songs: await listSongs() }));
