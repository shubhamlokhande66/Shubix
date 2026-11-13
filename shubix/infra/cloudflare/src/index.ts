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

const STUCK_AFTER = 20 * 60_000;

export class ReelApp extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "30s";
  constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
    super(ctx, env);
    if (typeof env.SLEEP_AFTER === "string" && env.SLEEP_AFTER) this.sleepAfter = env.SLEEP_AFTER;
    if (env.CONTAINER_ROLE === "api") this.defaultPort = 4000; // the API alone (the website is its own Worker)
    // every setting (vars and secrets) goes to the app as an environment variable; bindings are not strings
    this.envVars = Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === "string"));
    // The library never lets the container sleep while it counts a request in flight, until the answer has been read to
    // the end, and a request lost on the way (a rollout, a replaced container, a browser that stopped reading a video)
    // can stay counted for ever: QA stayed awake, and billed, with no request at all (2026-11-11), and production with a
    // tab's ping every 5 minutes holding off a "no request for 20 min" rule (2026-11-13). So this object keeps its own
    // list of the answers not yet read to the end: one open longer than STUCK_AFTER is a lost one, whatever else comes
    // in, and the library's count is cut to the ones still young, so the container sleeps. Anything still working (an
    // export) is polled, each poll a short request of its own.
    const lib = this as unknown as { inflightRequests: number; isActivityExpired(): boolean };
    const expired = lib.isActivityExpired.bind(this);
    lib.isActivityExpired = () => {
      const now = Date.now();
      for (const [id, at] of this.open) if (now - at > STUCK_AFTER) this.open.delete(id);
      if (lib.inflightRequests > this.open.size) {
        console.warn(`${lib.inflightRequests - this.open.size} request(s) counted in flight for more than ${STUCK_AFTER / 60_000} min: dropped, the container may sleep`);
        lib.inflightRequests = this.open.size;
      }
      return expired();
    };
  }
  // the requests whose answer is not yet read to the end, with when each began
  private open = new Map<number, number>();
  private nextId = 0;
  private track(res: Response, id: number): Response {
    if (!res.body || (res as Response & { webSocket?: unknown }).webSocket) { this.open.delete(id); return res; }
    const done = () => { this.open.delete(id); };
    return new Response(res.body.pipeThrough(new TransformStream({ flush: done })), res);
  }
  // A cold start (the machine, the R2 mount, the server) takes 20-30 s, more than the library waits by itself (20 s), and
  // its saved state can still say "healthy" from the container before: this object waits for the port itself, once
  // per start (`ready`: the server answered since this object woke or the container last stopped).
  // If the container stopped without this object hearing it (a new version rolled out), the answer is "not running":
  // the container is let go, started again and the request asked once more (a request with a body: the next one is).
  private ready = false;
  override onStop() { this.ready = false; }
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
    const id = this.nextId++;
    this.open.set(id, Date.now());
    try {
      const again = request.method === "GET" || request.method === "HEAD" ? request.clone() : null;
      if (!this.ready || !this.ctx.container?.running) { await this.wake(request.signal); this.ready = true; }
      const res = await super.fetch(request);
      if (res.status < 500 || !/^(Error proxying request to container|Failed to start container)/.test(await res.clone().text())) return this.track(res, id);
      this.ready = false;
      try { await this.destroy(); } catch { /* already gone */ }
      if (!again) return this.track(res, id);
      await res.body?.cancel(); // unread, the library would count it in flight
      await this.wake(again.signal); this.ready = true;
      return this.track(await super.fetch(again), id);
    } catch (e) { this.open.delete(id); throw e; }
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((env.CONTAINER_ROLE === "api" && !API_PATHS.test(path)) || PROBE.test(path)) return new Response("Not found", { status: 404 });
    if (request.method === "POST" && path === PING && !(await awake(env)))
      return Response.json({ ok: true, asleep: true });
    return app(env).fetch(request);
  },
  // The object that puts the container to sleep starts counting only when a request comes: a container started without
  // one (a deploy rolls out a new one) stays awake, and billed, until somebody uses the API (production: 6 h,
  // 2026-11-13). Every 10 minutes (wrangler.jsonc triggers): an awake container is sent one request, the health check,
  // and sleeps SLEEP_AFTER after it; one in use is kept awake by its own requests anyway.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      try { const s = await app(env).getState(); if (s.status !== "running" && s.status !== "healthy") return; }
      catch { return; }
      // read to the end: an unread answer stays counted in flight (the container would not sleep)
      try { await (await app(env).fetch(new Request("http://app/api/health"))).arrayBuffer(); } catch (e) { console.error("wake-to-sleep health check", e); }
    })());
  },
} satisfies ExportedHandler<Env>;
