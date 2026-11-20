import { route } from "../../../../server/core/http";
import { chooseSong, listSongs } from "../../../../server/songs";

/** "Choose a song for me": the library's song for these clips (?energy=0..1&kind=&min=seconds&last=<song id>&seed=). */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams, num = (k: string, d: number) => { const n = Number(q.get(k)); return Number.isFinite(n) ? n : d; };
  const song = chooseSong(await listSongs(), { energy: Math.max(0, Math.min(1, num("energy", 0.5))), kind: (q.get("kind") ?? "").slice(0, 40), minDur: Math.max(0, Math.min(600, num("min", 8))), last: (q.get("last") ?? "").slice(0, 40), seed: num("seed", Date.now()) });
  return { song };
});
