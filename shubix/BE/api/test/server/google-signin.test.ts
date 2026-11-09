// @vitest-environment node
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** "Continue with Google" (server/googleSignIn.ts) and the sign-in rules (server/core/access.ts, lib/access.ts). */

vi.mock("@/server/core/mail", async (orig) => ({ ...(await orig<typeof import("../../src/server/core/mail")>()), sendMail: async () => true }));

let mongo: MongoMemoryServer;
let G: typeof import("../../src/server/googleSignIn");
let X: typeof import("../../src/server/core/access");
let A: typeof import("../../src/server/accounts");
let L: typeof import("@shubix/core/lib/access");
let mainDb: typeof import("../../src/server/core/db").mainDb;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  Object.assign(process.env, { MONGODB_URI: mongo.getUri(), MONGODB_DB: "google_test", AUTH_ENABLED: "true", SECRET_KEY: "test-secret", PUBLIC_BASE_URL: "https://shubix.test", GOOGLE_CLIENT_ID: "cid.apps", GOOGLE_CLIENT_SECRET: "csecret" });
  G = await import("../../src/server/googleSignIn");
  X = await import("../../src/server/core/access");
  A = await import("../../src/server/accounts");
  L = await import("@shubix/core/lib/access");
  ({ mainDb } = await import("../../src/server/core/db"));
  await (await import("../../src/server/core/indexes")).ensureIndexes();
}, 120_000);
afterAll(async () => {
  await (await (await import("../../src/server/core/db")).client()).close();
  await mongo?.stop();
});
beforeEach(async () => { const d = await mainDb(); await d.collection("users").deleteMany({}); await d.collection("app_settings").deleteMany({}); await X.setAccess({}); });

const now = Date.now() / 1000;
const claims = (c: Record<string, unknown> = {}) => ({ iss: "https://accounts.google.com", aud: "cid.apps", exp: now + 600, email: "Riya@Example.com", email_verified: true, sub: "g-1", name: "Riya", ...c });
const idToken = (c: object) => `h.${Buffer.from(JSON.stringify(c)).toString("base64url")}.s`;
const google = (c: object, ok = true) => (async () => new Response(JSON.stringify({ id_token: idToken(c) }), { status: ok ? 200 : 400 })) as unknown as typeof fetch;
/** the start, then Google's answer with the same state (or another) */
async function signIn(c: object, next = "/create/music?p=abc&step=clips&go=1", state?: string) {
  const s = await G.start(new Request(`https://shubix.test/api/auth/google?next=${encodeURIComponent(next)}`));
  const cookie = /g_oauth=[^;]+/.exec(s.headers.get("set-cookie")!)![0], st = new URL(s.headers.get("location")!).searchParams.get("state")!;
  return G.callback(new Request(`https://shubix.test/api/auth/google/callback?code=c1&state=${state ?? st}`, { headers: { cookie } }), google(c));
}

describe("Google's answer is checked", () => {
  it("accepts only a proved email for this app, from Google, not expired", () => {
    expect(G.claimsOk(claims(), "cid.apps")).toBe(true);
    for (const bad of [{ aud: "other" }, { iss: "evil.com" }, { exp: now - 1 }, { email_verified: false }, { email: "" }]) expect(G.claimsOk(claims(bad), "cid.apps")).toBe(false);
  });
  it("goes to Google with this app, its callback and a fresh state; the page to return to stays on this site", async () => {
    const r = await G.start(new Request("https://shubix.test/api/auth/google?next=%2F%2Fevil.com"));
    const to = new URL(r.headers.get("location")!);
    expect(to.origin).toBe("https://accounts.google.com");
    expect(to.searchParams.get("client_id")).toBe("cid.apps");
    expect(to.searchParams.get("redirect_uri")).toBe("https://shubix.test/api/auth/google/callback");
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax/);
    const back = await signIn(claims(), "//evil.com");
    expect(back.headers.get("location")).toBe("https://shubix.test/");
  });
  it("refuses an answer without the state it sent", async () => {
    const r = await signIn(claims(), "/", "forged");
    expect(r.headers.get("location")).toContain("/login?error=google_state");
    expect(await (await mainDb()).collection("users").countDocuments()).toBe(0);
  });
  it("refuses a token for another app", async () => {
    const r = await signIn(claims({ aud: "someone-else" }));
    expect(r.headers.get("location")).toContain("error=google_failed");
  });
});

describe("the account", () => {
  it("is made with a proved email, signed in, and back on the studio page", async () => {
    const r = await signIn(claims());
    expect(r.headers.get("location")).toBe("https://shubix.test/create/music?p=abc&step=clips&go=1");
    expect(r.headers.get("set-cookie")).toMatch(/reel_session=/);
    const u = await (await mainDb()).collection("users").findOne({ email: "riya@example.com" });
    expect(u).toMatchObject({ emailVerified: true, googleId: "g-1" });
    expect(u!.password).toBeUndefined();
  });
  it("opens the existing account with that email and proves its email", async () => {
    await A.register("riya@example.com", "password123");
    const before = await (await mainDb()).collection("users").findOne({ email: "riya@example.com" });
    expect(before!.emailVerified).toBe(false);
    await signIn(claims());
    const users = await (await mainDb()).collection("users").find({}).toArray();
    expect(users).toHaveLength(1);
    expect(String(users[0]._id)).toBe(String(before!._id));
    expect(users[0].emailVerified).toBe(true);
  });
  it("is off when the administrator turns Google off", async () => {
    await X.setAccess({ google: false });
    await expect(G.start(new Request("https://shubix.test/api/auth/google"))).rejects.toThrow(/not switched on/);
  });
});

describe("the sign-in rules", () => {
  it("open the administrator's pages and their sub-pages; legal pages always; the person's own pages never", async () => {
    const a = await X.setAccess({ open: ["/", "/guides", "/create/music"] });
    expect(a).toMatchObject({ google: true, googleReady: true });
    for (const p of ["/", "/guides/beat-synced-reel", "/create/music", "/terms"]) expect(L.isOpen(p, a)).toBe(true);
    for (const p of ["/reels", "/account", "/create/photo", "/pricing", "/guidesx"]) expect(L.isOpen(p, a)).toBe(false);
  });
  it("keep only known pages", async () => {
    await expect(X.setAccess({ open: ["/admin"] })).rejects.toThrow(/Unknown page/);
    expect((await X.getAccess()).open).toEqual(L.DEFAULT_ACCESS.open);
  });
  it("return only to a page of this site", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "", null]) expect(L.safeNext(bad)).toBe("/");
    expect(L.safeNext("/editor?p=1")).toBe("/editor?p=1");
  });
});
