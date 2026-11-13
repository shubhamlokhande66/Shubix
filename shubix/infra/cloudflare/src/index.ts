import { Container, getContainer } from "@cloudflare/containers";

/** Reel Maker on Cloudflare: this Worker passes every request to ONE app container (the Next.js server, FFmpeg included;
 * with CONTAINER_ROLE "api" the API alone, the website being its own Worker: docs/deploy-website-cloudflare.md).
 * The container sleeps after SLEEP_AFTER without requests. Reels saved to My Reels are kept in R2: docker/start.sh mounts
 * the bucket in the container. */

interface Env {
  APP: DurableObjectNamespace<ReelApp>;
  SLEEP_AFTER?: string;
  CONTAINER_ROLE?: string;
  [key: string]: unknown;
}

const HUNG_AFTER = 3 * 60_000, KILL_AFTER = 15_000, PROBE_EVERY = 10_000;
/** "30s", "2m", "1h" (the library's sleepAfter form) in milliseconds */
const toMs = (t: string | number) => {
  if (typeof t === "number") return t * 1000;
  const m = /^(\d+)\s*(s|m|h)?$/.exec(t.trim());
  return m ? Number(m[1]) * ({ s: 1000, m: 60_000, h: 3_600_000 }[(m[2] ?? "s") as "s" | "m" | "h"]) : 30_000;
};

export class ReelApp extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "30s";
  constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
    super(ctx, env);
    if (typeof env.SLEEP_AFTER === "string" && env.SLEEP_AFTER) this.sleepAfter = env.SLEEP_AFTER;
    if (env.CONTAINER_ROLE === "api") this.defaultPort = 4000; // the API alone (the website is its own Worker)
    // every setting (vars and secrets) goes to the app as an environment variable; bindings are not strings
    this.envVars = Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === "string"));
    // The library never lets the container sleep while it counts a request in flight. A request that hangs (the container
    // replaced or rolled out while answering) stays counted for ever: the container stayed awake, and billed, 20+ min
    // with no request at all (QA 2026-11-13, 18:17 -> 18:36). A live request moves bytes or ends; one counted with no new
    // request and no byte up or down: the server is asked whether it is still answering (alarm, below). HUNG_AFTER is the
    // last resort when the server cannot be asked.
    const lib = this as unknown as { inflightRequests: number; isActivityExpired(): boolean };
    const expired = lib.isActivityExpired.bind(this);
    lib.isActivityExpired = () => {
      if (lib.inflightRequests > 0) {
        if (Date.now() - this.lastActivity > HUNG_AFTER) {
          console.warn(`${lib.inflightRequests} request(s) counted in flight with nothing moving for ${HUNG_AFTER / 60_000} min: dropped, the container may sleep`);
          lib.inflightRequests = 0;
          return expired();
        }
        // next look: SLEEP_AFTER after the last activity (not "SLEEP_AFTER from now" as the library would), then the
        // server is asked (alarm); while it says busy, again every PROBE_EVERY
        (lib as unknown as { sleepAfterMs: number }).sleepAfterMs = Math.max(Date.now() + 1000, this.lastActivity + toMs(this.sleepAfter), this.nextProbe);
        return false;
      }
      return expired();
    };
  }
  private nextProbe = 0;
  // the last request, or the last bytes of an upload or a download through this object
  private lastActivity = Date.now();
  private meter() {
    return new TransformStream<Uint8Array, Uint8Array>({ transform: (chunk, out) => { this.lastActivity = Date.now(); out.enqueue(chunk); } });
  }
  // The library only sends SIGTERM when the container should sleep. If the server does not exit (a request that never
  // ends keeps it closing for ever), the container stays up and billed, SIGTERM after SIGTERM. Asked once and still
  // running at the next check (SLEEP_AFTER later): killed.
  private stopAskedAt = 0;
  override async onActivityExpired() {
    if (!this.ctx.container?.running) { this.stopAskedAt = 0; return; }
    if (this.stopAskedAt && Date.now() - this.stopAskedAt > KILL_AFTER) {
      console.warn("container did not stop after SIGTERM: killed");
      this.stopAskedAt = 0; this.ready = false;
      try { await this.destroy(); } catch { /* already gone */ }
      return;
    }
    if (!this.stopAskedAt) { this.stopAskedAt = Date.now(); console.log("idle: asking the container to stop"); }
    await this.stop();
  }
  private lastRequest = Date.now();
  // A cold start (the machine, the R2 mount, the server) takes 20-30 s, more than the library waits by itself (20 s), and
  // its saved state can still say "healthy" from the container before: this object waits for the port itself, once
  // per start (`ready`: the server answered since this object woke or the container last stopped).
  // If the container stopped without this object hearing it (a new version rolled out), the answer is "not running":
  // the container is let go, started again and the request asked once more (a request with a body: the next one is).
  private ready = false;
  // A request still counted but with nothing moving for SLEEP_AFTER: the API server itself is asked how many requests
  // it is really answering (a Shubix AI call waits up to 2 min with no byte moving, and is real). None: the count is a
  // hung one, dropped, and the container sleeps SLEEP_AFTER after the last activity like any idle container.
  override async alarm(props?: { retryCount: number; isRetry: boolean }) {
    const lib = this as unknown as { inflightRequests: number; sleepAfterMs: number };
    const idleFor = Date.now() - this.lastActivity, sleepMs = toMs(this.sleepAfter);
    if (lib.inflightRequests > 0 && this.ctx.container?.running && idleFor >= sleepMs - 1000 && Date.now() >= this.nextProbe) {
      const active = await this.serverActive();
      this.nextProbe = Date.now() + PROBE_EVERY;
      if (active === 0) {
        this.nextProbe = 0;
        console.warn(`${lib.inflightRequests} request(s) counted but none answered by the server: dropped, the container may sleep`);
        lib.inflightRequests = 0;
        lib.sleepAfterMs = this.lastActivity + sleepMs;
      }
    }
    return super.alarm(props as never);
  }
  /** Requests the API server is answering right now (-1: could not ask). Asked on the container's port directly, so the
   * question itself does not count as activity. */
  private async serverActive(): Promise<number> {
    try {
      const r = await this.ctx.container!.getTcpPort(this.defaultPort).fetch("http://container/__active", { signal: AbortSignal.timeout(3000) });
      const n = Number(((await r.json()) as { active?: unknown }).active);
      return Number.isFinite(n) ? n : -1;
    } catch { return -1; }
  }
  override onStop() {
    this.ready = false; this.stopAskedAt = 0;
    // the container is gone: nothing can still be answering, a count left over would keep the next one awake
    (this as unknown as { inflightRequests: number }).inflightRequests = 0;
  }
  private async wake(signal?: AbortSignal) {
    // "running" but not yet confirmed by this object: a live server answers within seconds; one that does not is a
    // stuck container (it never really stopped) and is replaced, never waited on for minutes
    if (this.ctx.container?.running) {
      try { return await this.startAndWaitForPorts(this.defaultPort, { portReadyTimeoutMS: 20_000, instanceGetTimeoutMS: 10_000, abort: signal }); }
      catch (e) { if (signal?.aborted) throw e; console.error("running container not answering: replaced", e); try { await this.destroy(); } catch { /* gone */ } }
    }
    // a fresh start, up to 4 min: before the one-file bundle a wake on 1/4 vCPU took more than 90 s
    return this.startAndWaitForPorts(this.defaultPort, { portReadyTimeoutMS: 240_000, instanceGetTimeoutMS: 60_000, abort: signal });
  }
  override async fetch(request: Request): Promise<Response> {
    this.lastRequest = this.lastActivity = Date.now(); this.stopAskedAt = 0;
    // an upload counts as activity while its bytes come in (a slow phone sending a big clip is not a hung request)
    if (request.body) {
      const len = Number(request.headers.get("content-length"));
      let body = request.body.pipeThrough(this.meter());
      if (Number.isFinite(len) && len >= 0 && request.headers.has("content-length")) body = body.pipeThrough(new FixedLengthStream(len));
      request = new Request(request, { body });
    }
    const again = request.method === "GET" || request.method === "HEAD" ? request.clone() : null;
    if (!this.ready || !this.ctx.container?.running) { await this.wake(request.signal); this.ready = true; }
    let res = await super.fetch(request);
    if (res.status >= 500 && /^(Error proxying request to container|Failed to start container)/.test(await res.clone().text())) {
      this.ready = false;
      try { await this.destroy(); } catch { /* already gone */ }
      if (!again) return res;
      await this.wake(again.signal); this.ready = true;
      res = await super.fetch(again);
    }
    this.lastActivity = Date.now();
    // a download counts as activity while its bytes go out
    if (!res.body || res.webSocket) return res;
    return new Response(res.body.pipeThrough(this.meter()), res);
  }
  override onError(error: unknown) {
    console.error("app container error", error);
    throw error;
  }
}

const app = (env: Env) => getContainer(env.APP, "main");

// An open tab says "still here" every 5 minutes (lib/usePresence.ts, the admin's "online now"). Waking the container
// only for that would bill it for a few minutes each time someone leaves a tab open: while it sleeps, the Worker answers
// the ping itself. Opening a page wakes it anyway, so the first ping of a visit is still counted.
const PING = "/api/public/ping";
const awake = async (env: Env) => {
  try { const s = await app(env).getState(); return s.status === "running" || s.status === "healthy"; }
  catch { return true; } // unsure: as before, to the app
};

// The API alone answers only these: anything else (bots looking for .env files and the like) is answered here, without
// waking the container (it is billed while awake).
const API_PATHS = /^\/(api\/|ads\.txt$|app-ads\.txt$)/;
// bots looking for secrets under /api too (/api/.env, /api/v1/.git/config, /api/x.php): no real route has a part starting
// with a dot or ends like that
const PROBE = /\/\.|\.(env|php|asp|aspx|jsp|cgi|bak|sql|ini|log|ya?ml)$/i;

// ads.txt / app-ads.txt: asked often (ad crawlers, the website's own server, sometimes 20 at once) and they hardly
// change: kept in Cloudflare's cache for an hour, so they do not wake the container each time
const CACHED = /^\/(ads|app-ads)\.txt$/;
const cachedFetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
  const cache = (caches as unknown as { default: Cache }).default, key = new Request(new URL(request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await app(env).fetch(request);
  if (res.status !== 200 && res.status !== 404) return res;
  const keep = new Response(res.body, res);
  keep.headers.set("Cache-Control", "public, max-age=3600");
  ctx.waitUntil(cache.put(key, keep.clone()));
  return keep;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((env.CONTAINER_ROLE === "api" && !API_PATHS.test(path)) || PROBE.test(path)) return new Response("Not found", { status: 404 });
    if (request.method === "POST" && path === PING && !(await awake(env)))
      return Response.json({ ok: true, asleep: true });
    if (request.method === "GET" && CACHED.test(path)) return cachedFetch(request, env, ctx);
    return app(env).fetch(request);
  },
} satisfies ExportedHandler<Env>;
