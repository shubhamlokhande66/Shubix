import { z } from "zod";
import { requireAdmin } from "../../../../../server/core/admin";
import { body } from "../../../../../server/core/body";
import { route } from "../../../../../server/core/http";
import { deleteSong, setSong } from "../../../../../server/songs";

/** Admin → Songs: a song on or off for people, or deleted (its file too). */
export const PATCH = route<{ id: string }>(async (req, { id }) => { await requireAdmin(req); return setSong(id, (await body(req, z.object({ on: z.boolean() }))).on); });
export const DELETE = route<{ id: string }>(async (req, { id }) => { await requireAdmin(req); return deleteSong(id); });
