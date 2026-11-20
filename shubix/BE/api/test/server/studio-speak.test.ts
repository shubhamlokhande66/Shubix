// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { speak, SpeakIn, speechKey } from "../../src/server/studio/speak";

/** Fast Studio's text to speech: bounded requests, the same speech has the same key (never charged twice), the WAV of
 * the voice engine comes back, and a failing engine is an error (nothing kept). */
describe("text to speech", () => {
  it("accepts text up to 1200 characters and a style", () => {
    expect(SpeakIn.parse({ text: "  Hello  ", voice: "openai:nova" })).toEqual({ text: "Hello", voice: "openai:nova", style: "neutral" });
    expect(SpeakIn.safeParse({ text: "x".repeat(1201), voice: "openai:nova" }).success).toBe(false);
    expect(SpeakIn.safeParse({ text: "   ", voice: "openai:nova" }).success).toBe(false);
    expect(SpeakIn.safeParse({ text: "Hi", voice: "openai:nova", style: "angry" }).success).toBe(false);
  });
  it("the same text, voice and style: the same key; anything else: another", () => {
    const a = SpeakIn.parse({ text: "नमस्कार मित्रांनो", voice: "gemini:Kore" });
    expect(speechKey(a)).toBe(speechKey({ ...a }));
    expect(speechKey(a)).not.toBe(speechKey({ ...a, voice: "gemini:Puck" }));
    expect(speechKey(a)).not.toBe(speechKey({ ...a, style: "calm" }));
  });
  it("returns the engine's WAV, with the words and the style asked for", async () => {
    let seen = "";
    const r = await speak(SpeakIn.parse({ text: "Save first, then spend.", voice: "openai:nova", style: "energetic" }), async (ssml, voice, out) => { seen = `${voice} ${ssml}`; fs.writeFileSync(out, Buffer.from("RIFFxxxxWAVE")); });
    expect(r.wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(r.charged).toBe(0); // nobody signed in: nothing taken
    expect(seen).toContain("openai:nova");
    expect(seen).toContain("Save first, then spend.");
  });
  it("a failing voice engine is an error", async () => {
    await expect(speak(SpeakIn.parse({ text: "Hi", voice: "openai:nova" }), async () => { throw new Error("busy"); })).rejects.toThrow("busy");
  });
  it("an unknown voice is refused before anything is spoken", async () => {
    await expect(speak(SpeakIn.parse({ text: "Hi", voice: "sapi:David" }))).rejects.toMatchObject({ code: "VOICE_NOT_FOUND" });
  });
});
