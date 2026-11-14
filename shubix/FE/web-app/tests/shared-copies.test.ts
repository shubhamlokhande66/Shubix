import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The Android app has its own copy of some shared packages (FE/mobile-app/shared). These files decide how a Reel is
 * made, so the two copies must be the same text: a fix in one that misses the other gives the website and the app
 * different Reels from the same clips and song. A file listed here that differs fails with its name. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."), web = path.join(root, "Shared"), phone = path.join(root, "FE/mobile-app/shared");
const SAME = [
  "video-engine/src/index.ts",      // the director, the edit's tools
  "video-engine/src/review.ts",     // the edit's own review and the choice of a take
  "core/src/engine/studio/song.ts", // the music engine: beats, drops, cuts
];

describe("the shared files the website and the Android app must have alike", () => {
  for (const file of SAME) {
    it(file, () => {
      const a = fs.readFileSync(path.join(web, file), "utf8").replace(/\r\n/g, "\n"), b = fs.readFileSync(path.join(phone, file), "utf8").replace(/\r\n/g, "\n");
      expect(a === b).toBe(true);
    });
  }
  it("the whole video-engine package is listed (a new file there is added to this list)", () => {
    const files = fs.readdirSync(path.join(web, "video-engine/src")).map((f) => "video-engine/src/" + f).sort();
    expect(files).toEqual(SAME.filter((f) => f.startsWith("video-engine/")).sort());
  });
});
