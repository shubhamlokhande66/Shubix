/** A public ads file from the API (it follows the ids in Admin → Settings → Ads). Every page asks for ads.txt (the root
 * layout's AdSense tag): kept 5 minutes in this server's memory too, because Cloudflare Workers has no Next.js data cache
 * (on Vercel `revalidate` did that), else each page waited for the API. */
const kept = new Map<string, { at: number; status: number; body: string }>();
const KEEP_MS = 300_000;

/** wait: how long the API may take (the file itself waits longer than a page that only reads the id) */
export async function fetchAdsFile(name: "ads.txt" | "app-ads.txt", wait = 2500): Promise<Response> {
  const k = kept.get(name);
  if (k && Date.now() - k.at < KEEP_MS) return new Response(k.body, { status: k.status });
  // a new address every 5 minutes: a copy Cloudflare keeps of the API's file (hours, whatever it says) is never read
  const r = await fetch(`${(process.env.API_URL || "http://localhost:4000").replace(/\/$/, "")}/${name}?v=${Math.floor(Date.now() / KEEP_MS)}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(wait) })
    .then(async (x) => ({ status: x.status, ok: x.ok, body: await x.text() }))
    .catch(() => null);   // the API asleep or slow (it wakes in a few seconds)
  if (r && (r.ok || r.status === 404)) { kept.set(name, { at: Date.now(), status: r.status, body: r.body }); return new Response(r.body, { status: r.status }); }
  // the API did not answer: the last copy, however old, rather than an error (an ad crawler that gets an error reads "not found")
  if (k) return new Response(k.body, { status: k.status });
  return new Response("# Try again in a minute.\n", { status: 503, headers: { "Retry-After": "60" } });
}

/** The file as this site's own answer, not a rewrite: Vercel cached a rewrite's compressed copy and gave it to every client, which ad crawlers may not read. */
export async function adsFileResponse(name: "ads.txt" | "app-ads.txt") {
  const r = await fetchAdsFile(name, 8000);
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
