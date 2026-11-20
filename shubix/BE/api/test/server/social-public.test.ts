// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { resolveUser } from "../../src/server/core/auth";
import { settings } from "../../src/server/core/config";

/** Connecting YouTube / Instagram from the Android app happens in the phone's browser, where nobody is signed in: the
 * connect link and the platform's callback must reach their routes (which check the app's ticket themselves); the rest
 * of /api/social still needs a session. */
describe("social connect without a session", () => {
  const was = settings.authEnabled;
  (settings as { authEnabled: boolean }).authEnabled = true;
  afterAll(() => { (settings as { authEnabled: boolean }).authEnabled = was; });
  const get = (path: string, method = "GET") => resolveUser(new Request(`http://x${path}`, { method }));

  it("lets the connect link and the callback through", async () => {
    for (const p of ["youtube", "instagram"]) {
      await expect(get(`/api/social/${p}/connect?t=abc`)).resolves.toBeNull();
      await expect(get(`/api/social/${p}/callback?code=c&state=s`)).resolves.toBeNull();
    }
  });
  it("still asks for a session everywhere else under /api/social", async () => {
    await expect(get("/api/social")).rejects.toThrow(/sign in/i);
    await expect(get("/api/social/youtube", "DELETE")).rejects.toThrow(/sign in/i);
    await expect(get("/api/social/posts", "POST")).rejects.toThrow(/sign in/i);
    await expect(get("/api/social/youtube/connect/extra")).rejects.toThrow(/sign in/i);
  });
});
