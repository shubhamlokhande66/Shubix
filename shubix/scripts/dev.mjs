// Runs Shubix on this computer as QA, UAT or PROD, no code edits needed:
//   node scripts/dev.mjs qa          the API (localhost:4000) and the website (localhost:3001), the API with QA's settings
//   node scripts/dev.mjs qa --web    only the website, sending /api to the QA server (api-qa.shubix.in)
// The API reads only BE/api/servers/<qa|uat|prod>/.env (SHUBIX_ENV, server/core/config.ts): each environment its own
// whole file, like the servers. The first time, that file is made from BE/api/.env with the .env.example next to it put
// in (its database, also in the MongoDB address, its bucket, Cashfree mode); after that it is yours to change.
// Logs: logs/api-<name>.log, logs/web-<name>.log (scripts/with-log.mjs).
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

/** BE/api/.env with the example's KEY=value lines put in (replaced where .env has the key, added at the end where not);
 * MONGODB_DB also goes into the MongoDB address's path, so the address itself says which database it is. */
function envFor(base, example) {
  const set = {};
  for (const line of example.split(/\r?\n/)) { const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim()); if (m) set[m[1]] = m[2]; }
  const left = new Set(Object.keys(set));
  const lines = base.split(/\r?\n/).map((line) => {
    const m = /^\s*([A-Z_0-9]+)\s*=/.exec(line);
    if (!m) return line;
    if (m[1] === "MONGODB_URI" && set.MONGODB_DB) return line.replace(/^(\s*MONGODB_URI\s*=\s*["']?mongodb(?:\+srv)?:\/\/[^/?"'\s]+)(\/[^?"'\s]*)?/, `$1/${set.MONGODB_DB}`);
    if (!(m[1] in set)) return line;
    left.delete(m[1]);
    return `${m[1]}=${set[m[1]]}`;
  });
  const head = `# ${name.toUpperCase()} on this computer (npm run dev:${name}): its whole settings, read instead of .env. Made from .env on ${new Date().toISOString().slice(0, 10)}; change it here. Kept out of git.`;
  const extra = left.size ? ["", `# ${name.toUpperCase()}`, ...[...left].map((k) => `${k}=${set[k]}`)] : [];
  return [head, ...lines, ...extra].join("\n").replace(/\n*$/, "\n");
}

const children = [];
if (webOnly) {
  console.log(`[dev] ${name.toUpperCase()}: website on http://localhost:3001, API on ${SERVERS[name]}`);
  children.push(run(`web-${name}`, "@shubix/web-app", { API_URL: SERVERS[name] }));
} else {
  const rel = `BE/api/servers/${name}/.env`, file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    const base = path.join(root, "BE/api/.env");
    if (!fs.existsSync(base)) { console.error("[dev] BE/api/.env is missing: copy BE/api/.env.example to it and fill it in first"); process.exit(1); }
    fs.writeFileSync(file, envFor(fs.readFileSync(base, "utf8"), fs.readFileSync(`${file}.example`, "utf8")));
    console.log(`[dev] made ${rel} from BE/api/.env with ${name.toUpperCase()}'s database and bucket; ${name.toUpperCase()} reads only that file now`);
  }
  if (name === "prod") console.warn("[dev] PROD: the live database, the live bucket and real payments. Look, don't try things here.");
  console.log(`[dev] ${name.toUpperCase()}: API on http://localhost:4000 (${rel}), website on http://localhost:3001`);
  // the website's address here, not the file's: Google sign-in comes back to it (localhost:3001/api/auth/google/callback)
  children.push(run(`api-${name}`, "@shubix/api", { SHUBIX_ENV: name, PUBLIC_BASE_URL: "http://localhost:3001" }));
  children.push(run(`web-${name}`, "@shubix/web-app", { API_URL: "http://localhost:4000" }));
}
// Ctrl+C or one of them stopping stops both
const stop = () => { for (const c of children) if (c.exitCode === null) c.kill(); };
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stop(); process.exit(0); });
for (const c of children) c.on("exit", (code) => { stop(); process.exitCode = code ?? 0; });
