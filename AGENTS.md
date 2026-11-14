<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shubix: what to know before changing this repository

- **Layout.** Everything is in `shubix/` (a pnpm workspace): `FE/web-app` (Next.js, the website and its studio),
  `FE/mobile-app` (Expo, the Android app), `BE/api` (NestJS), `Shared/*` (packages both use). `folderStructure.md` and
  `shubix/docs/` say more.
- **Two engines make the Reel and must make it alike.** The website's is `FE/web-app/components/studio/engine.ts`; the
  Android app's is `FE/mobile-app/engine/brain/*.ts`, the same logic with `ES.` / `EH.` in front of its names. A change
  to how shots are picked, cut or styled goes into both.
- **Two copies of the shared packages.** `FE/mobile-app/shared/*` is a copy of `Shared/*`. A change to a shared file is
  made in both; `FE/web-app/tests/shared-copies.test.ts` fails by name when they differ.
- **Checks.** `npm run typecheck`, `npm test` in `shubix/`. CI (`.github/workflows/shubix-ci.yml`) runs only when
  started by hand, so run them before a pull request.
- **Beats.** A change to `Shared/core/src/engine/studio/song.ts` is measured with the beat benchmark before and after
  (`FE/web-app/scripts/studio-beats/README.md`); its results are kept in `baseline.json`.
- **The edit's own review.** `Shared/video-engine/src/review.ts` scores a finished edit and both engines act on it
  (`Shared/video-engine/README.md`). `FE/mobile-app/tests/edit-repairs.test.ts` runs the Android engine with no page.
- **Branches.** Work goes `qa` -> `uat` -> `main` (`shubix/docs/environments.md`). QA and UAT take real payments
  (live Cashfree keys).
