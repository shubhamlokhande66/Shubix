// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizeKept } from "../../src/server/studio/accuracy";

/** "Kept as Shubix made it" (Admin → Overview): of the Reels the studio made and the creator exported, the share
 * exported with no change after Shubix's edit, from the export lines of the Reels' logs. */
describe("kept as Shubix made it", () => {
  it("counts the Reels exported with no change, on both apps", () => {
    const s = summarizeKept([
      { changes: 0, platform: "web" }, { changes: 0, platform: "android" }, { changes: 3, platform: "web" }, { changes: 1, platform: "android" },
    ]);
    expect(s).toEqual({ exported: 4, kept: 2, share: 0.5, medianChanges: 0.5, web: 2, android: 2 });
  });
  it("leaves out Reels reopened from My Reels and lines without a count", () => {
    const s = summarizeKept([{ changes: 0, opened: true }, { changes: "0" }, {}, { changes: -1 }, { changes: 2 }]);
    expect(s.exported).toBe(1);
    expect(s.kept).toBe(0);
    expect(s.share).toBe(0);
  });
  it("has no share before any export", () => {
    expect(summarizeKept([])).toEqual({ exported: 0, kept: 0, share: null, medianChanges: null, web: 0, android: 0 });
  });
});
