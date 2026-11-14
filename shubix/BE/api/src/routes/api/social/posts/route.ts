import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { createPosts, PostIn } from "../../../../server/social";

/** Publish a Reel from My Reels to the connected platforms, now or at a time (`at`, ISO). */
export const POST = route(async (req) => createPosts(await body(req, PostIn)));
