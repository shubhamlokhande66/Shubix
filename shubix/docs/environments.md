# QA, UAT and Production

Three copies of Shubix, each with its own website, API, database and bucket, so testing never touches real users.

| | QA | UAT | Production |
|---|---|---|---|
| Branch | `qa` | `uat` | `main` |
| Website (Vercel) | `qa.shubix.in` (Preview, branch `qa`) | `uat.shubix.in` (Preview, branch `uat`) | `shubix.in` (Production) |
| API (Cloudflare Worker) | `shubix-api-qa`, `api-qa.shubix.in` | `shubix-api-uat`, `api-uat.shubix.in` | `shubix-api`, `api.shubix.in` |
| Database (`MONGODB_DB`) | `shubix_qa` | `shubix_uat` | as before |
| R2 bucket | `smgroup-qa` | `smgroup-uat` | `smgroup` |
| Payments | Razorpay test keys | Razorpay test keys | live keys |

Work goes up one step at a time: a feature branch is merged into `qa`, tested there, `qa` is merged into `uat` for the
final check, and `uat` into `main` for production.

## Deploying

By hand, as before (Actions minutes): GitHub → Actions → **Deploy to Cloudflare** (the API) and **Deploy website
(Vercel)** → Run workflow → pick `qa`, `uat` or `prod`. Each deploys its own branch (`qa`, `uat`, `main`), whatever
branch the workflow is started from. Deploy the API first when both changed.

From a computer with Docker: `cd shubix/infra/cloudflare && npx wrangler deploy --env qa` (or `--env uat`; no `--env`
is production).

## One-time setup

### GitHub

1. Create the branches from `main`: `git push origin main:qa main:uat`.
2. Settings → Environments: add `qa`, `uat` and `production`. On `production`, turn on **Required reviewers** (you) so a
   production deploy waits for your approval. The existing repo secrets (`CLOUDFLARE_*`, `VERCEL_*`) work in all three.

### Cloudflare

1. R2 → create the buckets `smgroup-qa` and `smgroup-uat`. Give each the same CORS policy as `smgroup`, with its own
   website: `https://qa.shubix.in` or `https://uat.shubix.in` (methods `GET, PUT, POST, HEAD`, `ExposeHeaders: ["ETag"]`).
   Make sure the R2 API token can use the new buckets.
2. The secrets of each environment (they are not copied from production):

   ```
   cd shubix/infra/cloudflare
   npx wrangler secret put MONGODB_URI --env qa
   npx wrangler secret put SECRET_KEY --env qa            # a new one, not production's
   npx wrangler secret put R2_ACCESS_KEY_ID --env qa
   npx wrangler secret put R2_SECRET_ACCESS_KEY --env qa
   npx wrangler secret put OPENAI_API_KEY --env qa        # and GEMINI_API_KEY if used
   npx wrangler secret put RAZORPAY_KEY_ID --env qa       # Razorpay TEST keys
   npx wrangler secret put RAZORPAY_KEY_SECRET --env qa
   npx wrangler secret put RAZORPAY_WEBHOOK_SECRET --env qa
   npx wrangler secret put GOOGLE_CLIENT_ID --env qa
   npx wrangler secret put GOOGLE_CLIENT_SECRET --env qa
   npx wrangler secret put SMTP_USER --env qa             # and SMTP_PASSWORD, SMTP_FALLBACK_USER, SMTP_FALLBACK_PASSWORD
   ```

   Then the same with `--env uat`. `npx wrangler secret list --env qa` shows what is set.
3. The first deploy makes `api-qa.shubix.in` and `api-uat.shubix.in` (the shubix.in zone is on Cloudflare). Check
   `https://api-qa.shubix.in/api/health` → `{"status":"ok"}`.

The API settings that are not secrets (`WEB_ORIGINS`, `PUBLIC_BASE_URL`, `MONGODB_DB`, `R2_BUCKET`, the AI provider…) are in
`shubix/infra/cloudflare/wrangler.jsonc` under `env.qa` and `env.uat`. A setting added to production must be added there too:
Wrangler does not copy `vars` into an environment.

### MongoDB Atlas

Nothing to create: `shubix_qa` and `shubix_uat` are made on first use. One cluster can hold all three. A separate Atlas user
per environment (`MONGODB_URI`) keeps a test from ever writing to production.

### Vercel (the same project)

1. Settings → Environment Variables → **Preview**, branch `qa`: `API_URL=https://api-qa.shubix.in`,
   `PUBLIC_BASE_URL=https://qa.shubix.in`. The same for branch `uat` with `api-uat` / `uat`.
2. Settings → Domains: add `qa.shubix.in` and `uat.shubix.in` (the workflow points them at each new deploy), and set the
   DNS records Vercel shows.
3. Settings → Deployment Protection: with Vercel Authentication on, `qa.` and `uat.` ask for a Vercel login first. Keep it on
   to keep them private, or turn it off for testers without a Vercel account.

### Google sign-in

Google Cloud Console → the OAuth client → add `https://qa.shubix.in` and `https://uat.shubix.in` to the authorised
origins, and their sign-in callback addresses next to production's.

### Phone app

Not split yet: its builds still use production (`EXPO_PUBLIC_API_URL`). QA / UAT builds need their own EAS profiles.
