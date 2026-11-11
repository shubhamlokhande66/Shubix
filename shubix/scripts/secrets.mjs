// Sends the secrets in BE/api/servers/<qa|uat|prod>/.env to that environment's Cloudflare Worker:
//   npm run secrets:qa        (from shubix/; asks before sending, values are never printed)
// A key added or changed in that file goes up the next time; deploy the API again after, the container reads its
// secrets when it starts. Only secrets go (names ending in KEY, SECRET, TOKEN, PASSWORD, URI, USER, ID); the other
// settings are the Worker's vars in infra/cloudflare/wrangler.jsonc, and a name set there is never sent; a setting in
// the file that wrangler.jsonc lacks, or has with another value, is shown as a warning.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!["qa", "uat", "prod"].includes(name)) { console.error("usage: node scripts/secrets.mjs <qa|uat|prod>"); process.exit(2); }
const NAME = name.toUpperCase();
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerDir = path.join(root, "infra/cloudflare");
const envFlag = name === "prod" ? "" : ` --env ${name}`;

const SECRET = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_URI|_USER|_ID)$|^SECRET_KEY$/;
const OLD = /^RAZORPAY_/; // Cashfree took its place
// sent only when the Worker has none yet: a new one signs everyone out (SECRET_KEY) or breaks the scheduler (CRON_SECRET)
const ONCE = new Set(["SECRET_KEY", "CRON_SECRET"]);
// settings that are this computer's own (ports, programs, folders): never a warning that the server has them otherwise
const LOCAL = /^(API_PORT|PORT|NODE_ENV|STORAGE_PATH|PUBLIC_BASE_URL|WEB_ORIGINS|COOKIE_SECURE|CONTAINER_ROLE|SLEEP_AFTER|FFMPEG_BIN|FFPROBE_BIN|SONG_IMPORT_FOLDERS|MEDIA_CACHE_GB|OLLAMA_.*|WHISPER_.*)$/;

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/** wrangler.jsonc without its comments (a // inside a string, like https://, stays) */
function readJsonc(file) {
  const s = fs.readFileSync(file, "utf8");
  let out = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { out += c; if (c === "\\") out += s[++i]; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i + 2) + 1; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const file = path.join(root, "BE/api/servers", name, ".env");
if (!fs.existsSync(file)) { console.error(`[secrets] BE/api/servers/${name}/.env is missing: run npm run dev:${name} once, it makes it`); process.exit(1); }
const env = readEnv(file);

const wrangler = readJsonc(path.join(wranglerDir, "wrangler.jsonc"));
const varValues = (name === "prod" ? wrangler.vars : wrangler.env?.[name]?.vars) ?? {};
const vars = new Set(Object.keys(varValues));

// QA and UAT take test payments only
const testPay = env.CASHFREE_ENV === "sandbox";
const skipped = [];
const send = {};
for (const [k, v] of Object.entries(env)) {
  if (!v || !SECRET.test(k) || vars.has(k) || OLD.test(k)) continue;
  if (name !== "prod" && k.startsWith("CASHFREE_") && !testPay) { skipped.push(`${k} (CASHFREE_ENV is not sandbox)`); continue; }
  send[k] = v;
}

let existing = [];
try {
  const raw = execSync(`npx wrangler secret list${envFlag}`, { cwd: wranglerDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  existing = JSON.parse(raw.slice(raw.indexOf("["))).map((s) => s.name);
} catch (e) {
  if (!/not found/i.test(String(e.stderr ?? e.message))) throw e; // a Worker never deployed has none yet
}
for (const k of ONCE) if (existing.includes(k)) { delete send[k]; skipped.push(`${k} (already on the Worker, kept)`); }

const local = fs.existsSync(path.join(root, "BE/api/.env")) ? readEnv(path.join(root, "BE/api/.env")) : {};
// PROD's file is made from .env, whose Cashfree keys are the test ones: those never go to shubix.in
if (name === "prod") for (const k of ["CASHFREE_APP_ID", "CASHFREE_SECRET_KEY"]) {
  if (send[k] && (send[k] === local[k] || env.CASHFREE_ENV !== "production")) { delete send[k]; skipped.push(`${k} (still the test key from .env: put the live one in servers/prod/.env)`); }
}
// a QA/UAT file made from .env still has the computer's SECRET_KEY / CRON_SECRET: that environment gets its own
if (name !== "prod") {
  let text = fs.readFileSync(file, "utf8"), changed = false;
  for (const k of ONCE) {
    if (existing.includes(k) || (send[k] && send[k] !== local[k])) continue;
    const fresh = crypto.randomBytes(k === "SECRET_KEY" ? 48 : 32).toString("base64url");
    const line = new RegExp(`^${k}=.*$`, "m");
    text = line.test(text) ? text.replace(line, `${k}=${fresh}`) : `${text.replace(/\n*$/, "\n")}${k}=${fresh}\n`;
    send[k] = fresh; changed = true;
  }
  if (changed) { fs.writeFileSync(file, text); console.log(`[secrets] servers/${name}/.env got its own SECRET_KEY / CRON_SECRET`); }
}

// the other settings reach the server only through wrangler.jsonc: say which ones this file has that the server won't
const notThere = [], differs = [];
for (const [k, v] of Object.entries(env)) {
  if (!v || SECRET.test(k) || OLD.test(k) || LOCAL.test(k)) continue;
  if (!vars.has(k)) notThere.push(k);
  else if (String(varValues[k]) !== v) differs.push(k);
}
if (notThere.length || differs.length) {
  const where = name === "prod" ? `"vars"` : `env.${name}.vars`;
  console.warn(`[secrets] warning: settings in servers/${name}/.env that ${NAME} does not get from this script (infra/cloudflare/wrangler.jsonc ${where}; deploy after a change):`);
  for (const k of notThere.sort()) console.warn(`  not on the server   ${k}   (only on this computer; add it to wrangler.jsonc if ${NAME} needs it)`);
  for (const k of differs.sort()) console.warn(`  server has another  ${k}   (wrangler.jsonc wins on the server)`);
}

const names = Object.keys(send).sort();
if (!names.length) { console.log(`[secrets] ${NAME}: nothing to send`); process.exit(0); }
console.log(`[secrets] ${NAME} Worker, from BE/api/servers/${name}/.env:`);
for (const k of names) console.log(`  ${existing.includes(k) ? "update" : "new   "}  ${k}`);
for (const s of skipped) console.log(`  skip    ${s}`);
if (name === "prod") console.warn("[secrets] PROD: these replace what shubix.in uses now (Cashfree here must be the LIVE keys).");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ok = /^y(es)?$/i.test((await rl.question(`Send ${names.length} to ${NAME}? (y/N) `)).trim());
rl.close();
if (!ok) { console.log("[secrets] nothing sent"); process.exit(0); }

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "shubix-")), "secrets.json");
try {
  fs.writeFileSync(tmp, JSON.stringify(send), { mode: 0o600 });
  execSync(`npx wrangler secret bulk "${tmp}"${envFlag}`, { cwd: wranglerDir, stdio: ["ignore", "inherit", "inherit"] });
} finally {
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}
console.log(`[secrets] sent. Deploy the ${NAME} API again (GitHub Actions -> Deploy to Cloudflare -> ${name}) so it starts with them.`);
