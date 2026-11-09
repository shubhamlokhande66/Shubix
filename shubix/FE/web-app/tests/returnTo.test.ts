import { afterEach, describe, expect, it, vi } from "vitest";
import { keepNext, needsSignIn, takeNext } from "@/lib/returnTo";

/** Generate Reel needs an account, free or paid (lib/returnTo.ts): only a signed-in person, or a studio without
 * accounts, goes on; when it cannot be checked, the person signs in first. */
const me = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body })));
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("Generate asks for an account", () => {
  it("lets a signed-in person go on, free or paid", async () => {
    me({ authEnabled: true, user: { id: "u", plan: "free" } });
    expect(await needsSignIn()).toBe(false);
  });
  it("asks when nobody is signed in", async () => {
    me({ authEnabled: true, user: null });
    expect(await needsSignIn()).toBe(true);
  });
  it("asks when it cannot be checked (offline, server asleep or down)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await needsSignIn()).toBe(true);
    me({}, false);
    expect(await needsSignIn()).toBe(true);
  });
  it("lets a studio without accounts go on", async () => {
    me({ authEnabled: false, user: null });
    expect(await needsSignIn()).toBe(false);
  });
});

describe("the page to come back to", () => {
  it("is kept once, and only on this site", () => {
    keepNext("/create/music?p=1&step=clips&go=1");
    expect(takeNext()).toBe("/create/music?p=1&step=clips&go=1");
    expect(takeNext()).toBe("/");
    keepNext("//evil.com");
    expect(takeNext()).toBe("/");
  });
});

describe("signing in waits for a sleeping server, up to a minute", () => {
  it("sends again while the server cannot be reached, then signs in", async () => {
    vi.useFakeTimers();
    const { patiently, ApiError } = await import("@/lib/api");
    let n = 0;
    const p = patiently(async () => { if (++n < 4) throw new ApiError(0, { code: "NETWORK_ERROR", message: "x" }); return "in"; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe("in");
    expect(n).toBe(4);
    vi.useRealTimers();
  });
  it("after a minute says it is a technical issue", async () => {
    vi.useFakeTimers();
    const { patiently, ApiError, TECH_ISSUE } = await import("@/lib/api");
    let n = 0;
    const p = patiently(async () => { n++; throw new ApiError(502, { code: "SERVER_DOWN", message: TECH_ISSUE }); });
    const caught = p.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await caught).message).toMatch(/Technical issue: our team is looking into it/);
    expect(n).toBeGreaterThan(10);
    vi.useRealTimers();
  });
  it("does not send again a wrong password (the server answered)", async () => {
    const { patiently, ApiError } = await import("@/lib/api");
    let n = 0;
    await expect(patiently(async () => { n++; throw new ApiError(401, { code: "BAD_CREDENTIALS", message: "The email or password is not correct." }); })).rejects.toThrow(/not correct/);
    expect(n).toBe(1);
  });
});
