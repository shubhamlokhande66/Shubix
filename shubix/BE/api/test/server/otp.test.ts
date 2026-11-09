// @vitest-environment node
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** One-time codes by email (server/accounts.ts): a sign-up becomes an account only with its code (until then it waits in
 * "signups", gone after a day); the reset code sets a new password; 6 digits, 10 minutes, 5 wrong tries, once, a new one
 * at most every minute; a sign-up code never resets a password. */

const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/server/core/mail", async (orig) => ({
  ...(await orig<typeof import("../../src/server/core/mail")>()),
  sendMail: async (to: string, subject: string, text: string) => { sent.push({ to, subject, text }); return true; },
}));

let mongo: MongoMemoryServer;
let A: typeof import("../../src/server/accounts");
let withUser: typeof import("../../src/server/core/auth").withUser;
let mainDb: typeof import("../../src/server/core/db").mainDb;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "otp_test";
  process.env.AUTH_ENABLED = "true";
  A = await import("../../src/server/accounts");
  ({ withUser } = await import("../../src/server/core/auth"));
  ({ mainDb } = await import("../../src/server/core/db"));
  await (await import("../../src/server/core/indexes")).ensureIndexes();
}, 120_000);
afterAll(async () => {
  await (await (await import("../../src/server/core/db")).client()).close();
  await mongo?.stop();
});
beforeEach(async () => { sent.length = 0; const d = await mainDb(); await d.collection("users").deleteMany({}); await d.collection("signups").deleteMany({}); });

const codeMails = () => sent.filter((m) => /\d{6}/.test(m.subject)); // (a new account also gets the welcome email)
const lastCode = () => /\d{6}/.exec(codeMails().at(-1)!.subject)![0];
const other = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, "0");
const cookies = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const req = (cookie: string) => new Request("http://x/api/auth/verify", { headers: { cookie } });
const users = async () => (await mainDb()).collection("users");
const signups = async () => (await mainDb()).collection("signups");
/** a sign-up: its browser's cookie (the code screen sends it) */
const signUp = async (email: string, ref?: string) => req(cookies(await A.register(email, "password123", ref)));
/** a sign-up finished with its code: the account's id and its session cookie */
const account = async (email: string) => {
  const s = await signUp(email), r = await A.verifyCode(lastCode(), s) as Response;
  return { id: String((await (await users()).findOne({ email }))!._id), cookie: cookies(r) };
};
const asUser = async (path: string, cookie: string) => (await import("../../src/server/core/auth")).resolveUser(new Request(`http://x${path}`, { headers: { cookie } }));

describe("no code, no account", () => {
  it("a sign-up left on the code screen makes no account, and is gone after a day", async () => {
    await signUp("left@x.com");
    expect(await (await users()).countDocuments()).toBe(0);
    const p = await (await signups()).findOne({ email: "left@x.com" });
    expect(p!.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
    expect(p!.password).toMatch(/^scrypt\$/); // only its hash
    const ttl = (await (await signups()).indexes()).find((i) => i.name === "signup_expires");
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("the right code makes the account, signed in, its email proved; the sign-up is gone", async () => {
    const r = await signUp("otp@x.com");
    const code = lastCode();
    expect(codeMails().at(-1)?.text).toContain(code);
    await expect(A.verifyCode(other(code), r)).rejects.toThrow(/not right. 4 tries left/);
    expect(await (await users()).countDocuments()).toBe(0); // a wrong code makes nothing
    const done = await A.verifyCode(code, r) as Response;
    expect(await done.json()).toMatchObject({ ok: true, email: "otp@x.com" });
    expect(done.headers.getSetCookie().join()).toMatch(/reel_session=.*reel_signup=""/s);
    const u = await (await users()).findOne({ email: "otp@x.com" });
    expect(u).toMatchObject({ emailVerified: true });
    expect(await (await signups()).countDocuments()).toBe(0);
    expect(await asUser("/api/credits", cookies(done))).toBe(String(u!._id));
    await vi.waitFor(() => expect(sent.find((m) => m.to === "otp@x.com" && m.subject.startsWith("Welcome"))?.text).toMatch(/\/pricing[\s\S]*Stop these emails/));
    await expect(A.verifyCode(code, r)).rejects.toThrow(/expired/); // used: the sign-up is gone
  });

  it("before its code, a sign-up opens nothing", async () => {
    const r = await signUp("new@x.com");
    const cookie = r.headers.get("cookie")!;
    await expect(asUser("/api/credits", cookie)).rejects.toMatchObject({ status: 401 });
    expect(await asUser("/api/plans", cookie)).toBeNull(); // public: as nobody
    expect((await A.me(r)).pending).toMatchObject({ email: "new@x.com" });
  });

  it("the code screen is told how long is left before a new code", async () => {
    const r = await signUp("wait@x.com");
    const left = (await A.me(r)).pending!;
    expect(left.codeWait).toBeGreaterThan(50);
    expect(left.codeWait).toBeLessThanOrEqual(60);
    await expect(A.resendVerify(r)).rejects.toMatchObject({ code: "VERIFY_TOO_SOON", details: { wait: expect.any(Number) } });
  });

  it("signing up again with the same email keeps one sign-up, without a second code within the minute", async () => {
    await signUp("again@x.com");
    const n = codeMails().length;
    await signUp("again@x.com");
    expect(codeMails().length).toBe(n);
    expect(await (await signups()).countDocuments({ email: "again@x.com" })).toBe(1);
  });

  it("signing in before the code goes back to the code screen with a new code", async () => {
    await signUp("back@x.com");
    await (await signups()).updateOne({ email: "back@x.com" }, { $unset: { "verifyOtp.sentAt": "" } }); // a minute has passed
    const before = codeMails().length, r = await A.login("back@x.com", "password123");
    expect(codeMails().length).toBe(before + 1);
    expect((await r.clone().json()).user.emailVerified).toBe(false);
    await expect(A.login("back@x.com", "wrong-password")).rejects.toThrow(/not correct/);
    expect(await A.verifyCode(lastCode(), req(cookies(r)))).toBeInstanceOf(Response);
    expect(await (await users()).countDocuments({ email: "back@x.com" })).toBe(1);
  });
});

describe("one-time codes", () => {
  it("lock after 5 wrong tries; a new code works; resend waits a minute", async () => {
    const r = await signUp("lock@x.com");
    const code = lastCode();
    for (let i = 0; i < 4; i++) await expect(A.verifyCode(other(code), r)).rejects.toThrow(/not right/);
    await expect(A.verifyCode(other(code), r)).rejects.toThrow(/Too many wrong tries/);
    await expect(A.verifyCode(code, r)).rejects.toThrow(/Too many wrong tries/); // even the right one now
    await expect(A.resendVerify(r)).rejects.toThrow(/wait \d+ seconds/);
    await (await signups()).updateOne({ email: "lock@x.com" }, { $set: { "verifyOtp.sentAt": new Date(Date.now() - 61_000) } });
    await A.resendVerify(r);
    expect(await A.verifyCode(lastCode(), r)).toBeInstanceOf(Response);
  });

  it("an old code expires", async () => {
    const r = await signUp("old@x.com");
    await (await signups()).updateOne({ email: "old@x.com" }, { $set: { "verifyOtp.expires": new Date(Date.now() - 1000) } });
    await expect(A.verifyCode(lastCode(), r)).rejects.toThrow(/expired/);
  });

  it("an account with that email cannot be signed up again", async () => {
    await account("taken@x.com");
    await expect(A.register("taken@x.com", "password123")).rejects.toThrow(/already exists/);
  });

  it("reset the password with the reset code (never with a sign-up code); the same answer for unknown emails", async () => {
    await account("reset@x.com");
    const signupCode = lastCode();
    expect(await A.forgot("nobody@x.com")).toMatchObject({ ok: true });
    expect(sent.some((m) => m.to === "nobody@x.com")).toBe(false);
    await expect(A.resetWithCode("nobody@x.com", "123456", "newpassword1")).rejects.toThrow(/expired/);

    await A.forgot("reset@x.com");
    const code = lastCode();
    expect(sent.at(-1)?.subject).toMatch(/password reset code/);
    await expect(A.resetWithCode("reset@x.com", signupCode === code ? other(code) : signupCode, "newpassword1")).rejects.toThrow(/not right/);
    await expect(A.resetWithCode("reset@x.com", code, "short")).rejects.toThrow(/at least 8/);
    const r = await A.resetWithCode("reset@x.com", code, "newpassword1");
    expect(r.status).toBe(200);
    await expect(A.resetWithCode("reset@x.com", code, "another-one1")).rejects.toThrow(/expired/); // once
    expect((await A.login("reset@x.com", "newpassword1")).status).toBe(200);

    await A.forgot("reset@x.com");
    const n = sent.length;
    await A.forgot("reset@x.com"); // within the minute: no second email
    expect(sent.length).toBe(n);
  });
});

describe("accounts from before", () => {
  it("an account made before the codes keeps working", async () => {
    const id = (await (await users()).insertOne({ email: "old@x.com", password: "x", sessionVersion: 0 })).insertedId;
    const { makeToken, COOKIE } = await import("../../src/server/core/auth");
    expect(await asUser("/api/credits", `${COOKIE}=${makeToken(String(id))}`)).toBe(String(id));
  });

  it("an account left unproved by the old sign-up still opens with its code", async () => {
    const id = String((await (await users()).insertOne({ email: "half@x.com", password: "x", sessionVersion: 0, emailVerified: false })).insertedId);
    await withUser(id, () => A.resendVerify());
    expect(await withUser(id, () => A.verifyCode(lastCode()))).toMatchObject({ ok: true, email: "half@x.com" });
    expect((await (await users()).findOne({ email: "half@x.com" }))!.emailVerified).toBe(true);
  });
});

describe("the published phone app", () => {
  it("keeps its sign-up: the account at once, unproved, opened by its code", async () => {
    const r = await A.register("phone@x.com", "password123", undefined, { accountFirst: true });
    expect(r.headers.getSetCookie().join()).toMatch(/reel_session=/); // its token
    const u = await (await users()).findOne({ email: "phone@x.com" });
    expect(u).toMatchObject({ emailVerified: false });
    expect(await withUser(String(u!._id), () => A.verifyCode(lastCode()))).toMatchObject({ ok: true });
  });
});
