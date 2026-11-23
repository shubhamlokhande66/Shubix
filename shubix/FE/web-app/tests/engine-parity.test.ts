import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Two engines make the Reel: the website's (components/studio/engine.ts) and the Android app's brain
 * (FE/mobile-app/engine/brain/*.ts), which is the same logic with `ES.` / `EH.` before its names. The parts named here
 * decide which moment of which clip each shot shows, so they must be the same code: a change made in one and not the
 * other gives the website and the app different Reels from the same clips and song ("In my order" had drifted this
 * way before this test). Comments and spacing may differ; the code may not. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// (Windows checkouts have CRLF line ends: without this, no function was found and both sides were "" - always alike)
const read = (f: string) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const web = read(path.join(root, "FE/web-app/components/studio/engine.ts"));
const brain = (f: string) => read(path.join(root, "FE/mobile-app/engine/brain", f));
const norm = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\bexport /g, "").replace(/\bE[SH]\./g, "").replace(/\s+/g, " ").trim();
/** a function's text: from its first line to the first line that is only "}" */
const fn = (text: string, head: string) => { const i = text.indexOf(head); if (i < 0) return "(not found: " + head + ")"; const j = text.indexOf("\n}\n", i); return text.slice(i, j + 2); };
const part = (text: string, from: string, to: string) => { const i = text.indexOf(from), j = text.indexOf(to, i); return i < 0 || j < 0 ? "(not found: " + from + ")" : text.slice(i, j); };

describe("the website's engine and the Android app's brain pick the same moments", () => {
  const alike: [string, string, string][] = [
    ["In my order: which clip each shot shows", "function seqSlots(n){", "edit.ts"],
    ["In my order: the moment of the clip", "function seqPick(seq, res, gmax){", "edit.ts"],
    ["In my order: the teaser that opens the Reel", "function teaserOpen(seq, res, gmax){", "edit.ts"],
    ["each shot's part in the story", "function storyRole(i){", "edit.ts"],
    ["shot flow: a moment's look", "function flowLook(src, a, b, st, m){", "edit.ts"],
    ["shot flow: the looks of the shots beside it", "function flowNear(i, res, gmax){", "edit.ts"],
    ["what Shubix AI's look adds to a moment", "function aiBonus(ai, slot, last, part, at){", "pure.ts"],
    ["the reading of a moment (movement, light, black, sharpness, faces)", "function windowStats(src, a, b){", "pure.ts"],
    ["the index those readings come from", "function statsIndex(src){", "pure.ts"],
    ["a clip's black part", "function blackPart(src){", "pure.ts"],
    ["a clip's black start and end", "function blackEnds(src){", "pure.ts"],
    ["cuts too close together", "function noFlashCuts(", "edit.ts"],
    ["the pace of creators' beat Reels", "function paceWell(p){", "edit.ts"],
  ];
  for (const [what, head, file] of alike) {
    it(what, () => { expect(norm(fn(brain(file), head.replace("function ", "function "))) === norm(fn(web, head))).toBe(true); });
  }
  it("Mix all clips: the picker, the takes and the repairs", () => {
    const w = part(web, "  const pick = (i, allowNeighbour", "  const useCount = sources.map");
    const b = part(brain("reel.ts"), "  const pick = (i, allowNeighbour", "  const useCount = ES.sources.map");
    expect(w.length).toBeGreaterThan(2000);
    expect(norm(b) === norm(w)).toBe(true);
  });
});
