// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

/** Publish to Instagram and YouTube: tokens kept encrypted, the sign-in flows to each platform with a state that must come
 * back, and a refused or mismatched answer sends the person back to My Reels with the reason (nothing kept). */
let S: typeof import("../../src/server/social");
beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "gid"; process.env.GOOGLE_CLIENT_SECRET = "gsecret";
  process.env.INSTAGRAM_APP_ID = "igid"; process.env.INSTAGRAM_APP_SECRET = "igsecret";
  process.env.PUBLIC_BASE_URL = "https://shubix.in"; process.env.SECRET_KEY = "test-secret";
  S = await import("../../src/server/social");
});

describe("tokens", () => {
  it("are sealed (not readable, not the same twice) and open again", () => {
    const a = S.seal("ya29.token"), b = S.seal("ya29.token");
    expect(a).not.toContain("ya29"); expect(a).not.toBe(b);
    expect(S.open(a)).toBe("ya29.token");
    const [iv, tag, body] = a.split(".");
    expect(() => S.open([iv, tag, body.slice(0, -2) + (body.endsWith("A") ? "B" : "A")].join("."))).toThrow();
  });
});

describe("connecting", () => {
  it("YouTube: Google's sign-in with upload and read scopes, offline, a state cookie", async () => {
    const r = S.connect("youtube"), to = new URL(r.headers.get("location")!);
    expect(to.host).toBe("accounts.google.com");
    expect(to.searchParams.get("scope")).toContain("youtube.upload");
    expect(to.searchParams.get("access_type")).toBe("offline");
    expect(to.searchParams.get("redirect_uri")).toBe("https://shubix.in/api/social/youtube/callback");
    expect(r.headers.get("set-cookie")).toContain(`s_oauth=youtube.${to.searchParams.get("state")}`);
  });
  it("Instagram: Instagram's business sign-in with the publish scope", () => {
    const to = new URL(S.connect("instagram").headers.get("location")!);
    expect(to.host).toBe("www.instagram.com");
    expect(to.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
  });
  it("a wrong state or a refusal goes back to My Reels with the reason", async () => {
    const bad = await S.callback("youtube", new Request("https://shubix.in/api/social/youtube/callback?code=x&state=evil", { headers: { cookie: "s_oauth=youtube.good" } }));
    expect(bad.headers.get("location")).toBe("https://shubix.in/reels?tab=saved&social=youtube&result=state");
    const no = await S.callback("instagram", new Request("https://shubix.in/api/social/instagram/callback?error=access_denied&state=s1", { headers: { cookie: "s_oauth=instagram.s1" } }));
    expect(no.headers.get("location")).toContain("result=cancelled");
  });
});

describe("posting", () => {
  it("checks the request", () => {
    expect(S.PostIn.safeParse({ reelId: "665f1c2b9d3e4a0012345678", platforms: ["youtube"], caption: "x".repeat(2201) }).success).toBe(false);
    expect(S.PostIn.safeParse({ reelId: "665f1c2b9d3e4a0012345678", platforms: [] }).success).toBe(false);
    expect(S.PostIn.parse({ reelId: "665f1c2b9d3e4a0012345678", platforms: ["instagram", "youtube"], at: "2026-12-01T10:00:00.000Z" }).at).toBe("2026-12-01T10:00:00.000Z");
  });
});
