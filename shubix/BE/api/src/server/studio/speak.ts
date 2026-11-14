import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ValidationFailed } from "../core/errors";
import { costOf, chargeOnce, refund } from "../credits";
import { buildSsml, speech, voiceProvider, type VoiceInfo } from "../voice";

/** Fast Studio's text to speech: natural AI voices (OpenAI, Gemini: any language, safe for a paid product), spoken on
 * the server and mixed on the phone like a voiceover (the song steps back while it speaks). Only the AI voices: the
 * server's own (Windows) voices are not offered to the studio. One credit per piece of speech; the same text in the
 * same voice and style is never charged twice (reopening a saved Reel makes its speech again). */

export const COST_ACTION = "studio_voice";
export const STYLES = ["neutral", "friendly", "energetic", "calm", "serious"] as const;
export const SpeakIn = z.object({
  text: z.string().trim().min(1, "Type what the voice should say.").max(1200),
  voice: z.string().min(3).max(60),
  style: z.enum(STYLES).default("neutral"),
});
export type SpeakInput = z.infer<typeof SpeakIn>;

const aiVoices = async (): Promise<VoiceInfo[]> => (await voiceProvider().listVoices()).filter((v) => v.provider === "openai" || v.provider === "gemini");
/** The voices the studio can offer, best known first (OpenAI's are steadier for Indian names). */
export async function speakOptions(planAi: boolean) {
  const voices = (await aiVoices()).sort((a, b) => (a.provider === b.provider ? 0 : a.provider === "openai" ? -1 : 1));
  let credits = 0;
  try { credits = await costOf(COST_ACTION); } catch { /* prices unreadable: the charge decides */ }
  return { available: voices.length > 0, planAi, credits, styles: STYLES, voices: voices.map((v) => ({ key: v.id, label: v.name.replace(/ \((OpenAI|AI), any language\)$/, ""), gender: v.gender, provider: v.provider })) };
}

export const speechKey = (p: SpeakInput) => crypto.createHash("sha1").update(`${p.voice}|${p.style}|${p.text}`).digest("hex").slice(0, 24);

/** The speech as a WAV. `synth` is the voice engine (tests give their own). */
export async function speak(p: SpeakInput, synth?: (ssml: string, voice: string, out: string) => Promise<void>): Promise<{ wav: Buffer; charged: number }> {
  if (!synth) {
    if (!(await aiVoices()).some((v) => v.id === p.voice)) throw new ValidationFailed("This voice is not available. Choose another voice.", { code: "VOICE_NOT_FOUND" });
    synth = (s, v, o) => voiceProvider().synthesize(s, v, o);
  }
  const c = await chargeOnce(COST_ACTION, speechKey(p), "Text to speech in Fast Studio");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio_tts_")), out = path.join(dir, "speech.wav");
  try {
    await synth(buildSsml(p.text, speech({ emotion: p.style }), "en-US"), p.voice, out);
    return { wav: fs.readFileSync(out), charged: c.taken };
  } catch (e) {
    if (c.taken) await refund(c.ref);
    throw e;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
