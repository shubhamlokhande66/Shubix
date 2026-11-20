import { isPlanAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { route } from "../../../../server/core/http";
import { limits } from "../../../../server/core/rateLimit";
import { aiAllowed, requireAiPlan } from "../../../../server/credits";
import { speak, SpeakIn, speakOptions } from "../../../../server/studio/speak";

/** Fast Studio's text to speech. GET: the AI voices this server has (none without an OpenAI or Gemini key) and whether
 * the person's plan has Shubix AI. POST { text, voice, style }: the speech as a WAV (1 credit; the same speech again is free). */
export const GET = route(async (req) => speakOptions((await aiAllowed(await isPlanAdmin(req), { credits: true })).ok));
export const POST = route(async (req) => {
  await requireAiPlan(await isPlanAdmin(req), { credits: true });
  limits.ai(req);
  const { wav, charged } = await speak(await body(req, SpeakIn));
  return new Response(new Uint8Array(wav), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400", "x-credits-charged": String(charged) } });
});
