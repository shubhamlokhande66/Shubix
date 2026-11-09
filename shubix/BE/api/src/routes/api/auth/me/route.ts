import { route } from "../../../../server/core/http";
import { me } from "../../../../server/accounts";

export const GET = route(async (req) => me(req));
