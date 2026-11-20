import { route } from "../../../../../server/core/http";
import { songFile } from "../../../../../server/songs";

/** A library song's file, for the studio to read. */
export const GET = route<{ id: string }>(async (_req, { id }) => songFile(id));
