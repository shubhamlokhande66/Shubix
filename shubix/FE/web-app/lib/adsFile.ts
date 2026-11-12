/** A public ads file from the API (it follows the ids in Admin → Settings → Ads). Every page asks for ads.txt (the root
 * layout's AdSense tag): kept 5 minutes in this server's memory too, because Cloudflare Workers has no Next.js data cache
 * (on Vercel `revalidate` did that), else each page waited for the API. */
const kept = new Map<string, { at: number; status: number; body: string }>();
const KEEP_MS = 300_000;

export async function fetchAdsFile(name: "ads.txt" | "app-ads.txt"): Promise<Response> {
  const k = kept.get(name);
  if (k && Date.now() - k.at < KEEP_MS) return new Response(k.body, { status: k.status });
  const r = await fetch(`${(process.env.API_URL || "http://localhost:4000").replace(/\/$/, "")}/${name}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(2500) });
  const body = await r.text();
  if (r.ok || r.status === 404) kept.set(name, { at: Date.now(), status: r.status, body }); // a server error is asked again
  return new Response(body, { status: r.status });
}

/** The file as this site's own answer, not a rewrite: Vercel cached a rewrite's compressed copy and gave it to every client, which ad crawlers may not read. */
export async function adsFileResponse(name: "ads.txt" | "app-ads.txt") {
  const r = await fetchAdsFile(name);
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
