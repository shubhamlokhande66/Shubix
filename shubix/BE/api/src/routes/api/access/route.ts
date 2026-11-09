import { route } from "../../../server/core/http";
import { getAccess } from "../../../server/core/access";

/** The sign-in rules (everyone may read them: pages open before signing in, Google sign-in). */
export const GET = route(async () => getAccess());
