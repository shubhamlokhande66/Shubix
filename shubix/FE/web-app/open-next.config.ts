import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The website on Cloudflare Workers (OpenNext): `pnpm cf:build` makes .open-next/ (the Worker and its static files) and
// wrangler.jsonc deploys it (.github/workflows/deploy-cloudflare-web.yml). No cache for pages: every page is drawn per
// request (none uses ISR or "use cache"; the one fetch with revalidate, lib/adsFile.ts, simply asks the API each time).
export default defineCloudflareConfig();
