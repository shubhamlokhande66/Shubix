import { describe, expect, it } from "vitest";
import { safeMessage } from "@mobile/utils";

// What the app and the website show when something fails: our own words, never the app's insides (2026-11-27: a
// file's path or name, a code error, a library's or the system's message, a server's details are kept from people).
const FALLBACK = "Something went wrong. Please try again.";
describe("the words of an error people see", () => {
  it("keeps our own messages", () => {
    for (const m of ["Please sign in.", "We could not hear anyone talking in these clips.", "Too many tries. Please wait a moment and try again.", "Your plan allows 3 Reels. Upgrade for more."])
      expect(safeMessage(m)).toBe(m);
  });
  it("hides paths, file names, codes and system errors", () => {
    for (const m of [
      "/data/user/0/in.shubix/cache/copy-1.mp4", "content://media/external/video/12", "This clip cannot be read: 1-VID_2024.mp4",
      "open failed: ENOENT (No such file or directory)", "java.lang.IllegalStateException: no picture", "Model download failed (404)",
      "Cannot read properties of undefined (reading 'x')", "TypeError: x is not a function", '{"error":"bad"}', "https://api-qa.shubix.in/api/x failed",
    ]) expect(safeMessage(m)).toBe(FALLBACK);
  });
  it("gives the fallback asked for, and for nothing or something very long", () => {
    expect(safeMessage("", "Try again.")).toBe("Try again.");
    expect(safeMessage(undefined)).toBe(FALLBACK);
    expect(safeMessage("a".repeat(400))).toBe(FALLBACK);
  });
});
