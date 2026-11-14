import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The Android app has its own copy of the shared packages (FE/mobile-app/shared). A fix in one copy that misses the
 * other gives the website and the app different behaviour, so every file the two have in common must be the same text.
 * The files in DIFFERENT are the ones that already differed on 2026-11-14 (a few lines each; some are the app's own
 * additions). They are not checked, but the list may only shrink: a file made alike again must leave it, and a new
 * difference is never added here without a reason next to it. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."), web = path.join(root, "Shared"), phone = path.join(root, "FE/mobile-app/shared");
const PACKAGES = ["core", "validations", "types", "utils", "video-engine"];
const DIFFERENT = [
  "core/src/lib/collections.ts", "core/src/lib/features-list.ts", "core/src/lib/nav.ts", "core/src/lib/plan-locks.ts",
  "core/src/lib/shaders.ts",       // the app adds BEAUTY_FRAG (skin smoothing as one pass)
  "core/src/lib/texts-studio.ts", "core/src/lib/texts.ts",
  "validations/src/editor.ts", "types/src/index.ts",
];
/** what the Reel itself is made by: these may never be in DIFFERENT */
const ENGINE = ["video-engine/src/index.ts", "video-engine/src/review.ts", "core/src/engine/studio/song.ts"];

function filesOf(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? filesOf(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join("/")]);
}
const text = (file: string) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const inBoth = PACKAGES.flatMap((p) => filesOf(path.join(web, p, "src")).map((f) => `${p}/src/${f}`)).filter((f) => fs.existsSync(path.join(phone, f))).sort();
const alike = (f: string) => text(path.join(web, f)) === text(path.join(phone, f));

describe("the shared files the website and the Android app both have", () => {
  it("are the same text in both copies", () => {
    expect(inBoth.filter((f) => !DIFFERENT.includes(f) && !alike(f))).toEqual([]);
  });
  it("the list of files that differ only shrinks", () => {
    expect(DIFFERENT.filter((f) => !inBoth.includes(f) || alike(f))).toEqual([]);
  });
  it("the files a Reel is made by are in both copies and never on that list", () => {
    expect(ENGINE.filter((f) => !inBoth.includes(f) || DIFFERENT.includes(f))).toEqual([]);
    expect(inBoth.length).toBeGreaterThan(20);
  });
});
