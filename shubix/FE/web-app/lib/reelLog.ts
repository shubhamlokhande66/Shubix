/** One Reel's log (Admin → Logs): the studio's steps with their time and data, sent to the server in small batches, and
 * every call the studio makes to the API with the JSON it sent and what came back. The Reel is the studio's project id
 * (window.__shubixReelId, set by the engine); it also goes with each API call (the x-reel-id header), so the server's own
 * lines for it (each AI call's prompt and answer) land in the same log. Never in the way: a failure here is ignored. */

type Level = "info" | "warn" | "error";
type Line = { t: number; seq: number; step: string; msg: string; level: Level; ms?: number | null; data?: unknown };
type Win = Window & { __shubixReelId?: () => string; __shubixReelLog?: typeof reelLog; __shubixReelFetch?: boolean };

const ENDPOINT = "/api/public/reel-log";
const MAX_DATA = 8000;      // characters of JSON kept per line here (the server keeps up to 24 000)
const MAX_BATCH = 40;
const pending: Line[] = [];
const BEACON_MAX = 60_000;  // a beacon carries at most 64 KB
let seq = 0, forReel = "", timer: ReturnType<typeof setTimeout> | null = null;

const reelId = () => { try { return (window as Win).__shubixReelId?.() || ""; } catch { return ""; } };

/** Data made small enough to send: long strings shortened, files and pictures by size, the whole cut at MAX_DATA. */
function small(v: unknown): unknown {
  if (v === undefined) return undefined;
  const seen = new WeakSet<object>();
  let s: string;
  try {
    s = JSON.stringify(v, (_k, x) => {
      if (typeof x === "number") return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : String(x);
      if (typeof x === "string") return x.startsWith("data:") ? `[${x.slice(5, x.indexOf(";"))} ${x.length} chars]` : x.length > 3000 ? x.slice(0, 3000) + `… [${x.length} chars]` : x;
      if (typeof Blob !== "undefined" && x instanceof Blob) return `[${x.type || "file"} ${(x.size / 1e6).toFixed(2)} MB${x instanceof File ? " " + x.name : ""}]`;
      if (x instanceof ArrayBuffer || ArrayBuffer.isView(x)) return `[${(x as ArrayBuffer).byteLength} bytes]`;
      if (typeof HTMLElement !== "undefined" && x instanceof HTMLElement) return `[${x.tagName.toLowerCase()}]`;
      if (typeof x === "function") return undefined;
      if (x && typeof x === "object") { if (seen.has(x)) return "[again]"; seen.add(x); }
      return x;
    }) ?? "null";
  } catch { return "[not readable]"; }
  if (s.length <= MAX_DATA) { try { return JSON.parse(s); } catch { return s; } }
  return { cut: true, size: s.length, start: s.slice(0, MAX_DATA) };
}

function send(useBeacon: boolean) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending.length || !forReel) return;
  const lines = pending.splice(0, MAX_BATCH);
  const body = JSON.stringify({ reelId: forReel, lines });
  try {
    if (useBeacon && body.length < BEACON_MAX && navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    else void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < BEACON_MAX }).catch(() => {});
  } catch { /* never in the way */ }
  if (pending.length) timer = setTimeout(() => send(false), 400);
}
function later() { if (!timer) timer = setTimeout(() => send(false), 2500); }

/** A line in the current Reel's log. Lines written before the Reel has its id wait for it (at most 200). */
export function reelLog(step: string, msg: string, data?: unknown, level: Level = "info", ms?: number | null) {
  try {
    const id = reelId();
    if (id && id !== forReel) { if (forReel && pending.length) send(false); forReel = id; seq = 0; }
    if (!id && pending.length > 200) return;
    pending.push({ t: Date.now(), seq: seq++, step: String(step).slice(0, 60), msg: String(msg).slice(0, 500), level, ms: ms == null ? null : Math.round(ms), data: small(data) });
    if (!forReel) return;
    if (pending.length >= MAX_BATCH || level === "error") send(false); else later();
  } catch { /* never in the way */ }
}

// the API calls worth a line: the studio's own and every change; never the log itself, health checks or pings
const SKIP = /^\/api\/(public\/(reel-log|client-error|ping)|health|auth\/me|boot|notifications|presence)/;
const WANT = /^\/api\/(studio|templates|convert|ai|reels|credits\/spend)/;

async function describeBody(b: BodyInit | null | undefined): Promise<unknown> {
  if (b == null) return undefined;
  if (typeof b === "string") { try { return JSON.parse(b); } catch { return b.slice(0, 3000); } }
  if (typeof FormData !== "undefined" && b instanceof FormData) {
    const o: Record<string, unknown> = {};
    b.forEach((v, k) => { o[k] = typeof v === "string" ? (v.length > 3000 ? v.slice(0, 3000) + "…" : v) : `[${v.type || "file"} ${(v.size / 1e6).toFixed(2)} MB ${v.name}]`; });
    return o;
  }
  if (typeof Blob !== "undefined" && b instanceof Blob) return `[${b.type || "file"} ${(b.size / 1e6).toFixed(2)} MB]`;
  if (b instanceof URLSearchParams) return Object.fromEntries(b);
  return "[stream]";
}

/** Every studio call to the API: the Reel's id on it, and a line with what was sent and what came back. Once. */
export function installReelLog() {
  if (typeof window === "undefined") return;
  const w = window as Win;
  w.__shubixReelLog = reelLog;
  if (w.__shubixReelFetch) return;
  w.__shubixReelFetch = true;
  window.addEventListener("pagehide", () => send(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(true); });
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const id = reelId();
    let url: URL | null = null;
    try { url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href); } catch { /* not a URL */ }
    const path = url && url.origin === location.origin ? url.pathname : "";
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!id || !path.startsWith("/api/") || SKIP.test(path)) return orig(input, init);
    // the Reel's id goes with it (the server's lines for this call join the same log)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-reel-id", id);
    const logIt = method !== "GET" || WANT.test(path);
    const started = performance.now();
    const sent = logIt ? await describeBody(init?.body).catch(() => undefined) : undefined;
    try {
      const r = await orig(input instanceof Request ? new Request(input, { headers }) : input, { ...init, headers });
      if (logIt) {
        const ms = performance.now() - started, type = r.headers.get("content-type") ?? "";
        let got: unknown = `[${type || "no type"} ${r.headers.get("content-length") ?? "?"} bytes]`;
        if (/json/.test(type)) got = await r.clone().json().catch(() => "[not JSON]");
        reelLog("api", `${method} ${path}${url?.search ?? ""} → ${r.status} · ${Math.round(ms)} ms`, { sent, got }, r.ok ? "info" : r.status >= 500 ? "error" : "warn", ms);
      }
      return r;
    } catch (e) {
      if (logIt) reelLog("api", `${method} ${path} failed: ${e instanceof Error ? e.message : String(e)}`, { sent }, (e as Error)?.name === "AbortError" ? "warn" : "error", performance.now() - started);
      throw e;
    }
  };
}
