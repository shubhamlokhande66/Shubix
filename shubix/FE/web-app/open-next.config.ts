import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The website on Cloudflare Workers (OpenNext): `pnpm cf:build` makes .open-next/ (the Worker and its static files) and
// wrangler.jsonc deploys it (.github/workflows/deploy-cloudflare-web.yml). No cache for pages: every page is drawn per
// request (none uses ISR or "use cache"; the one fetch with revalidate, lib/adsFile.ts, keeps its answer 5 minutes in
// memory itself). Static files' headers: public/_headers.
const config = defineCloudflareConfig();

type Override = NonNullable<NonNullable<typeof config.default.override>["proxyExternalRequest"]>;
type Proxied = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/** /api/* is passed to the API (next.config.ts rewrites). OpenNext's own "fetch" proxy follows redirects itself, so the
 * API's 302s never reached the browser: Google sign-in showed Google's page at /api/auth/google and lost the state
 * cookie, and its callback lost the session cookie (2026-11-12). This one is the same with `redirect: "manual"`: a
 * redirect and its Set-Cookie go to the browser as they are, as on Vercel. */
const proxy = {
  name: "fetch-proxy-manual-redirects",
  proxy: async ({ url, headers: inHeaders, method, body }: Proxied) => {
    const headers = Object.fromEntries(Object.entries(inHeaders).filter(([k]) => !["cf-connecting-ip", "x-forwarded-host"].includes(k.toLowerCase())));
    if (inHeaders.host) headers["x-forwarded-host"] = inHeaders.host; // like Next.js: never the client's own x-forwarded-host
    const r = await fetch(url, { method, headers, body: body as BodyInit | undefined, redirect: "manual" });
    const out: Record<string, string | string[]> = {};
    r.headers.forEach((v, k) => { const cur = out[k]; out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]; });
    // each cookie on its own (forEach may join several Set-Cookie headers into one line)
    const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
    if (cookies.length) out["set-cookie"] = cookies;
    return { type: "core", headers: out, statusCode: r.status, isBase64Encoded: true, body: r.body ?? new ReadableStream({ start: (c) => c.close() }) };
  },
};

config.default.override = { ...config.default.override, proxyExternalRequest: (async () => proxy) as unknown as Override };

export default config;
