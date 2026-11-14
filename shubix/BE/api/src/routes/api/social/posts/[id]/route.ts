import { route } from "../../../../../server/core/http";
import { cancelPost } from "../../../../../server/social";

/** Cancel a scheduled post that has not started. */
export const DELETE = route<{ id: string }>(async (_req, { id }) => cancelPost(id));
