# Website and API on Cloudflare

```
browser / phone app ──> Cloudflare Worker (FE/web-app, Next.js through OpenNext) ──/api/*──> Cloudflare Worker ──> API container (BE/api, FFmpeg, AI models)
                                                                                                                  └─> R2 bucket (mounted) + MongoDB Atlas
```

The website calls `/api` on its own address; its Worker passes it on to the API (`next.config.ts` rewrites, `API_URL`),
so the sign-in cookie stays the website's own. The API keeps the parts a Worker cannot run (FFmpeg, the AI models, a
lasting disk: the R2 bucket mounted by `infra/docker/start.sh`). The website moved here from Vercel on 2026-11-12.

## 1. The API (first: the website needs its address)

Same as `docs/deploy-cloudflare.md` (Workers Paid plan, R2 bucket, Atlas allowing `0.0.0.0/0`, the secrets), with these
settings in `infra/cloudflare/wrangler.jsonc` → `vars` (and each `env`):

| Setting | Value |
|---|---|
| `CONTAINER_ROLE` | `api`: the container runs the API alone (the Worker sends requests to its port 4000) |
| `WEB_ORIGINS` | the website's addresses, comma-separated (`https://shubix.in,https://www.shubix.in`) |
| `PUBLIC_BASE_URL` | the website's address: links in emails open the website |

Deploy: GitHub → Actions → **Deploy to Cloudflare** → Run workflow (`qa`, `uat` or `prod`). Check
`https://api.shubix.in/api/health` (`{"status":"ok"}`).

## 2. The website

`FE/web-app/wrangler.jsonc` holds the three Workers: `shubix-web` (shubix.in and www), `shubix-web-qa` and
`shubix-web-uat`, each with its `API_URL` and `PUBLIC_BASE_URL`. GitHub → Actions → **Deploy website (Cloudflare
Workers)** → Run workflow → pick `qa`, `uat` or `prod`: it builds with `pnpm cf:build` (OpenNext, on Linux: the build
fails on Windows with a symlink error) and deploys with wrangler, then checks the home page and `/api/health` through it.

- `next.config.ts` headers() apply only to what Next.js answers. The static files (`/_next/static`, `/vendor/ort`,
  `sw.js`, icons) are served by Cloudflare directly with the headers in `public/_headers`. Keep the two the same: the
  studio's worker scripts need COEP/CORP or WebAssembly runs on one core.
- A custom domain needs its name free in Cloudflare DNS: delete any old record for it first (error 100117 otherwise).
- The website holds no secrets: the database, payments, email and AI keys stay with the API.

## 3. The phone app

`FE/mobile-app` (EAS → Environment variables, then build again):

| Name | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | the API's address |
| `EXPO_PUBLIC_SITE_URL` | the website's address (`https://shubix.in`): the phone's hidden studio opens `/engine` there |

## 4. A new domain

Add it to `FE/web-app/wrangler.jsonc` (`routes`, `custom_domain: true`), to the API's `WEB_ORIGINS` and
`PUBLIC_BASE_URL`, and to the R2 bucket's CORS (Settings → CORS policy → AllowedOrigins: methods `GET, PUT, POST, HEAD`,
`ExposeHeaders: ["ETag"]`): clips upload from the browser straight into R2.

## Limits to know

- A request through the website is capped at 100 MB (Workers Paid); `next.config.ts` lets a proxied body be 100 MB.
- `API_URL` is read when the website is built: after changing it, deploy the website again.
- The API container sleeps after its last request (`SLEEP_AFTER`): the first API call after a pause waits while it wakes.
- After every deploy, open `https://api.shubix.in/api/health`. Once a new version left the container running but not
  answering: running Deploy to Cloudflare again started it fresh.
