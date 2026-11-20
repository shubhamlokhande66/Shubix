/** Fast Studio's text to speech on the website: the natural AI voices of the server (/api/studio/speak: OpenAI, Gemini),
 * in the shape the studio takes (`tts` in components/studio/engine.ts: its voices, and speak → the sound as PCM). Each
 * piece of speech is kept in this browser (Cache Storage), so reopening a Reel or undoing does not ask the server again. */

export type TtsVoice = { key: string; label: string };
export type Tts = { voices: TtsVoice[]; speak: (text: string, voice: string, onProgress?: (p: { stage: "download" | "run"; p: number }) => void) => Promise<{ pcm: Float32Array; sr: number }> };

const CACHE = "shubix-tts-v1";
async function hash(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
async function cached(key: string): Promise<ArrayBuffer | null> {
  try { const r = await (await caches.open(CACHE)).match(key); return r ? await r.arrayBuffer() : null; } catch { return null; }
}
async function keep(key: string, wav: ArrayBuffer) {
  try { await (await caches.open(CACHE)).put(key, new Response(wav, { headers: { "content-type": "audio/wav" } })); } catch { /* private window: not kept */ }
}

/** The voices, or null when this server has none (no OpenAI / Gemini key) or cannot be reached quickly. */
export async function loadTts(): Promise<Tts | null> {
  let info: { available?: boolean; voices?: TtsVoice[] } = {};
  try {
    const r = await fetch("/api/studio/speak", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    info = await r.json();
  } catch { return null; }
  if (!info.available || !info.voices?.length) return null;
  return {
    voices: info.voices.map((v) => ({ key: v.key, label: v.label })),
    async speak(text, voice, onProgress) {
      onProgress?.({ stage: "run", p: 0.1 });
      const key = `${location.origin}/__tts/${await hash(`${voice}|${text}`)}`;
      let wav = await cached(key);
      if (!wav) {
        let r: Response | null = null;
        for (let n = 1; n <= 3; n++) {
          try { r = await fetch("/api/studio/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) }); }
          catch { r = null; }
          if (r && (r.ok || (r.status < 500 && r.status !== 429))) break;
          if (n < 3) await new Promise((ok) => setTimeout(ok, 1500 * n));
        }
        if (!r) throw new Error("No connection. Check your internet and try again.");
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error?.message || (r.status === 402 ? "AI voices are part of the Editor and Pro plans, or use credits." : `The voice could not be made (${r.status}). Please try again.`));
        }
        wav = await r.arrayBuffer();
        void keep(key, wav.slice(0));
      }
      onProgress?.({ stage: "run", p: 0.9 });
      const sr = 48000, b = await new OfflineAudioContext(1, 1, sr).decodeAudioData(wav);
      onProgress?.({ stage: "run", p: 1 });
      return { pcm: b.getChannelData(0).slice(), sr };
    },
  };
}
