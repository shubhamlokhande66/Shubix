import { route } from "../../../server/core/http";
import { overview } from "../../../server/social";

/** Publish: the platforms (connected or not) and the posts, newest first; asking moves due posts on a step. */
export const GET = route(async () => overview());
