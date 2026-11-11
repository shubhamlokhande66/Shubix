// Runs Shubix on this computer as QA, UAT or PROD, no code or .env edits needed:
//   node scripts/dev.mjs qa          the API (localhost:4000) and the website (localhost:3001), the API with QA's settings
//   node scripts/dev.mjs qa --web    only the website, sending /api to the QA server (api-qa.shubix.in)
// The API reads BE/api/.env and then BE/api/.env.<qa|uat|prod> on top (SHUBIX_ENV, server/core/config.ts); that file
// is made from .env.<name>.example the first time. Logs: logs/api-<name>.log, logs/web-<name>.log (scripts/with-log.mjs).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVERS = { qa: "https://api-qa.shubix.in", uat: "https://api-uat.shubix.in", prod: "https://api.shubix.in" };
const [name, ...flags] = process.argv.slice(2);
if (!SERVERS[name]) { console.error("usage: node scripts/dev.mjs <qa|uat|prod> [--web]"); process.exit(2); }
const webOnly = flags.includes("--web");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = "npx -y pnpm@10.20.0";
const run = (log, filter, env) => spawn(`node scripts/with-log.mjs ${log} ${pnpm} --filter ${filter} dev`, { cwd: root, shell: true, stdio: "inherit", env: { ...process.env, ...env } });

const children = [];
if (webOnly) {
  console.log(`[dev] ${name.toUpperCase()}: website on http://localhost:3001, API on ${SERVERS[name]}`);
  children.push(run(`web-${name}`, "@shubix/web-app", { API_URL: SERVERS[name] }));
} else {
  const file = path.join(root, "BE/api", `.env.${name}`);
  if (!fs.existsSync(file)) {
    fs.copyFileSync(`${file}.example`, file);
    console.log(`[dev] made BE/api/.env.${name} from the example; fill in what it asks for and run this again if something is missing`);
  }
  if (name === "prod") console.warn("[dev] PROD: the live database, the live bucket and real payments. Look, don't try things here.");
  console.log(`[dev] ${name.toUpperCase()}: API on http://localhost:4000 (BE/api/.env + .env.${name}), website on http://localhost:3001`);
  children.push(run(`api-${name}`, "@shubix/api", { SHUBIX_ENV: name }));
  children.push(run(`web-${name}`, "@shubix/web-app", { API_URL: "http://localhost:4000" }));
}
// Ctrl+C or one of them stopping stops both
const stop = () => { for (const c of children) if (c.exitCode === null) c.kill(); };
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stop(); process.exit(0); });
for (const c of children) c.on("exit", (code) => { stop(); process.exitCode = code ?? 0; });
