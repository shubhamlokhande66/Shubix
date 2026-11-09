import { describe, expect, it } from "vitest";
import { SFX_REC, sfxRecorded } from "@mobile/core/lib/sfx-recorded";

describe("recorded sound effects", () => {
  it("decodes every sound at any rate, as loud as the made-up ones", () => {
    for (const k of Object.keys(SFX_REC)) {
      const y = sfxRecorded(k, 48000)!, peak = y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(y.length).toBeGreaterThan(48000 * 0.03);
      expect(peak).toBeGreaterThan(0.45); expect(peak).toBeLessThan(0.52);
    }
    expect(sfxRecorded("whoosh", 48000)).toBeNull();
    expect(sfxRecorded("toString", 48000)).toBeNull();
  });
});
