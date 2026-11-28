import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

// Opening text: Auto gives a Reel with no text Shubix's opening line (autoHook); None gives none and takes one already
// there away (a creator who wants no text got "WATCH TILL THE END" on every Reel: QA 2026-11-18). engine.ts alike.
type Host = { ES: Record<string, any>; brain: Record<string, any> };
async function reel(text?: "auto" | "none") {
  const w = world(4, 11);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths });
  if (text) await w.e.call("choose", { text });
  await w.e.call("ready");
  return Object.assign(w.e.host() as unknown as Host, { choose: (t: "auto" | "none") => w.e.call("choose", { text: t }) });
}
const autos = (h: Host) => (h.ES.overlays as { auto?: boolean }[]).filter((o) => o.auto).length;

describe("Opening text", () => {
  it("Auto: the Reel opens on Shubix's words", async () => {
    expect(autos(await reel("auto"))).toBeGreaterThan(0);
  });
  it("nothing chosen: None, no opening words (the default, 2026-11-28)", async () => {
    expect(autos(await reel())).toBe(0);
  });
  it("None: no opening words", async () => {
    expect(autos(await reel("none"))).toBe(0);
  });
  it("None chosen after the Reel is made: the words go; Auto again: they come back", async () => {
    const h = await reel("auto");
    expect(autos(h)).toBeGreaterThan(0);
    await h.choose("none");
    expect(autos(h)).toBe(0);
    await h.choose("auto");
    expect(autos(h)).toBeGreaterThan(0);
  });
});
