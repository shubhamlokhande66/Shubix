import { createHost, soundOf } from "../engine/brain/host";
import initial from "../engine/brain/initial-state.json";
import { goodSecs, limitStereo, windowStats } from "../engine/brain/pure";
import { bestMoment, checkExportedReel, clipAdvice, instaCardStart, lookStats, onsetCurve, reactionsOf, readReel, stillEnd, type ExportExpect, type Pic } from "@mobile/video-engine";
import { describeCut, soundMap } from "../engine/components/studio/soundmap";
import { TTS_VOICES, voiceLanguage } from "../engine/lib/tts/voices";

/** The studio: its operations run on the brain in the app's own JS, with the phone's own code doing the heavy work through
 * its file server (SongAnalysis.kt, ClipScan.kt, ClipFaces.kt). */
type Fetch = (url: string, init?: { method?: string; body?: unknown }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;
export type NativeIo = { base: string; key: string; fetch: Fetch; /** the pause between the 3 tries (ms; 1 s, then 2 s) */ apiWait?: number; token?: () => Promise<string | null>; onProgress?: (what: "song" | "clips", p: number) => void;
  /** Shubix AI's question: true Use, false the other button, null closed */
  ask?: (q: { title: string; text: string; list?: string[]; bal?: number | null; ok: string; no?: string; after?: number | null }) => Promise<boolean | null>;
  /** what Shubix is doing, in its words; an error when `err` */
  stat?: (text: string, err?: boolean) => void; spent?: () => void; tell?: (text: string) => void;
  /** one clip was read, or could not be */
  clipDone?: (name: string, ok: boolean, best?: number | null) => void;
  /** a step of the work popup */
  readBytes?: (path: string, at: number, length: number) => Promise<Uint8Array>;
  task?: (state: "start" | "progress" | "done" | "fail" | "clear", id: string, title?: string, detail?: string, kind?: string, p?: number | null) => void };
type Args = Record<string, unknown>;
type Clip = { path: string; name: string };
const PHOTO = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i;
/** what is read in place of the file picked: a heavy clip's smooth copy, or a photo made a moving clip (`photo`: its seconds) */
type Copy = { name: string; path: string; w: number; h: number; photo?: number };

/** A template's kind of Reel (the website's TPL_STYLE, components/studio/engine.ts): its learned style and AI trend */
const TPL_STYLE: Record<string, string> = { wedding: "wedding", travel: "travel", tripphotos: "travel", ganpati: "festival", diwali: "festival", navratri: "festival", holi: "festival", padwa: "festival", eid: "festival",
  christmas: "festival", newyear: "festival", product: "product", sale: "product", recipe: "food", gym: "fitness", birthday: "birthday", bdayphotos: "birthday", dayinlife: "vlog", cardelivery: "car", opening: "shop", party: "event" };
const ascii = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };

/** A clip's frame gaps say whether its frame rate varies: screen recordings, WhatsApp, many Android phones in low light. */
export function variesFrameRate(times: number[]) {
  if (times.length < 20) return false;
  const t = [...times].sort((a, b) => a - b), d: number[] = [];
  for (let i = 1; i < t.length; i++) { const g = t[i] - t[i - 1]; if (g > 1e-4) d.push(g); }
  if (d.length < 15) return false;
  const med = [...d].sort((a, b) => a - b)[d.length >> 1], off = d.filter((g) => g > med * 1.6 || g < med * 0.6).length / d.length;
  return off > 0.12 || Math.max(...d) > Math.max(0.25, med * 6);
}
export type ClipFacts = { dur: number; w: number; h: number; size?: number; fps?: number; hdr?: boolean; tenBit?: boolean; chroma422?: boolean; times?: number[]; end?: number };
/** The preview copy every clip larger than the editor's player gets (CapCut and VN do the same): at most 960 on its long
 * side, 30 fps, a key frame every quarter of a second, so each cut of a beat Reel starts at once and the phone decodes a
 * small picture. Only the editor's player reads it; the export reads the clip (or its edit copy) at full size.
 * null: the clip is small enough already. */
export const PREVIEW_SIDE = 960;
export function previewCopyOf(w: number, h: number, dur: number) {
  const long = Math.max(w, h);
  if (long <= PREVIEW_SIDE * 1.15 || dur <= 0 || dur > 1200) return null;
  const k = PREVIEW_SIDE / long, even = (v: number) => Math.max(2, Math.round((v * k) / 2) * 2);
  return { w: even(w), h: even(h), bitrate: 3_000_000 };
}
/** The edit copy a heavy clip needs (HDR, 10-bit, more than 30 fps, a varying frame rate, very large), H.264 at 30 fps; null: none. */
export function editCopyOf(f: ClipFacts) {
  const long = Math.max(f.w, f.h), size = f.size ?? 0, rate = f.dur > 0 ? (size * 8) / f.dur : 0;
  const heavy = !!f.hdr || !!f.tenBit || !!f.chroma422 || variesFrameRate(f.times ?? []) || (f.fps ?? 0) > 31 || long > 3840 || (long > 1920 && (rate > 20_000_000 || !size));
  if (!heavy || f.dur <= 0 || f.dur > 1200 || size > 8 * 1024 ** 3) return null;
  const k = Math.min(1, 1920 / long), even = (v: number) => Math.max(2, Math.round((v * k) / 2) * 2);
  const b = size ? Math.max(1_500_000, Math.min(10_000_000, Math.floor(rate * 0.9), Math.floor((400 * 1024 ** 2 * 8) / f.dur))) : 8_000_000;
  return { w: even(f.w), h: even(f.h), bitrate: b };
}

/** The song's bytes as the file server gives them: rate and channels, then floats, one sample of each channel after another */
export function pcmOf(raw: ArrayBuffer) {
  const top = new DataView(raw, 0, 8), sampleRate = top.getInt32(0, true), count = top.getInt32(4, true), all = new Float32Array(raw, 8), n = Math.floor(all.length / count);
  const channels = Array.from({ length: count }, () => new Float32Array(n)), mono = new Float32Array(n);
  for (let k = 0; k < count; k++) { const d = channels[k]; for (let i = 0; i < n; i++) { d[i] = all[i * count + k]; mono[i] += d[i] / count; } }
  return { sampleRate, channels, mono };
}

/** the file server's answer of lines: progress, then the one that starts with `first` */
function lastLine(text: string, first: string) {
  const lines = text.split("\n").filter(Boolean), last = lines[lines.length - 1] ?? "";
  if (last[0] !== first) throw new Error(last || "The phone could not read this file");
  return JSON.parse(last);
}

/** The Reel's whole sound as a 16-bit WAV: the studio's gain with its tiny fades, the limiter, the peak brought to -0.5 dBFS */
export function wavOf(buf: { length: number; sampleRate: number; numberOfChannels: number; getChannelData(c: number): Float32Array }, gain: number) {
  const n = buf.length, sr = buf.sampleRate, L0 = buf.getChannelData(0), R0 = buf.getChannelData(Math.min(1, buf.numberOfChannels - 1)), a = Math.round(0.02 * sr), z = Math.round(0.25 * sr);
  const at = (i: number) => (i < a ? i / a : 1) * (i > n - z ? Math.max(0, (n - i) / z) : 1) * gain;
  const G0 = new Float32Array(n), G1 = new Float32Array(n); for (let i = 0; i < n; i++) { const g = at(i); G0[i] = L0[i] * g; G1[i] = R0[i] * g; }
  const [L, R] = limitStereo(G0, G1, sr);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0.944 ? 0.944 / peak : 1, out = new ArrayBuffer(44 + n * 4), v = new DataView(out);
  const tag = (o: number, t: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  tag(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); tag(36, "data"); v.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { v.setInt16(o, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true); v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true); }
  return out;
}

/** A WAV file's sound as one channel of samples (16-bit PCM, as the server's AI voices come: /api/studio/speak). */
export function pcmOfWav(bytes: ArrayBuffer): { pcm: Float32Array; sr: number } {
  const v = new DataView(bytes), tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("The voice could not be read. Please try again.");
  let ch = 1, sr = 24000, bits = 16, at = -1, size = 0;
  for (let o = 12; o + 8 <= bytes.byteLength;) {
    const id = tag(o), n = v.getUint32(o + 4, true);
    if (id === "fmt ") { ch = v.getUint16(o + 10, true) || 1; sr = v.getUint32(o + 12, true) || sr; bits = v.getUint16(o + 22, true) || 16; }
    if (id === "data") { at = o + 8; size = Math.min(n, bytes.byteLength - at); break; }
    o += 8 + n + (n & 1);
  }
  if (at < 0 || bits !== 16) throw new Error("The voice could not be read. Please try again.");
  const frames = Math.floor(size / (2 * ch)), pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < ch; c++) s += v.getInt16(at + (i * ch + c) * 2, true); pcm[i] = s / ch / 32768; }
  return { pcm, sr };
}

/** the layers that need no file: the end card's black, cinematic bars, a colour flash (StudioLayers.kt draws them) */
const FILL_KINDS = ["shade", "bars", "tint"];

export function createNativeEngine(io: NativeIo) {
  const make0 = () => createHost(JSON.stringify(initial), { analyse: (m: Float32Array, sr: number, opts: Args) => analyse(m, sr, opts), getCtx, apiFetch, aiFrames, readSound, speechProbs, popMask, popCut, ask: (q: Parameters<NonNullable<NativeIo["ask"]>>[0]) => io.ask ? io.ask(q) : Promise.resolve(null), stat: io.stat, spent: io.spent, tell: io.tell, task: io.task, voices: TTS_VOICES, speak });
  // My brand (the app keeps it: lib/engine.ts): every new Reel's host gets it
  let brand: { handle: string; logoPath: string | null; logoW?: number; logoH?: number; mark: boolean; end: boolean } | null = null;
  const make = () => { const h = make0(); h.ES.brand = brand; return h; };
  let host = make(), signedIn = false;
  /** Shubix AI did not edit this Reel: the reason, in Ask Shubix's history (it was silent before) */
  function aiWhyOff() {
    const i = host.ES.aiInfo as { available?: boolean; planAi?: boolean } | null;
    const why = !i ? "Shubix AI could not be reached (signed out, or no internet): this Reel was edited on your phone."
      : !i.available ? "Shubix AI is off right now: this Reel was edited on your phone."
      : i.planAi === false ? "Shubix AI is not in your plan: this Reel was edited on your phone. Editor and Pro, or credits, add it."
      : "This Reel was edited on your phone.";
    const msgs = (host.ES.chatMsgs ||= []) as { at: number; who: string; text: string; log?: boolean }[];
    if (msgs[msgs.length - 1]?.text !== why) msgs.push({ at: Date.now(), who: "ai", text: why, log: true });
  }
  /** The template's kind of Reel (the website's TPL_STYLE and styleForTemplate, components/studio/engine.ts): with Shubix
   * AI on, the kind's trend leads the AI's guide (reelKind); without it, the kind's learned style (the Reels the
   * administrator taught, Admin -> My trends) is put on unseen, as a learned "Copy a Reel". */
  async function templateKind(id: string) {
    const ES = host.ES, k = TPL_STYLE[id] ?? "";
    ES.tplName = id; ES.tplKind = k;
    const dropLearned = () => { if (ES.refProfile?.learned && ES.refProfile.byTpl) { const shown = ES.refProfile.shown; ES.refProfile = null; if (ES.mode === "copy") ES.mode = shown || "auto"; } };
    if (ES.refProfile && !ES.refProfile.learned) return;   // a Reel the creator is copying comes first
    if (!k || ES.kind === "talk" || ES.aiOn) return dropLearned();
    try {
      const r = await apiFetch(`/api/studio/styles/learned?category=${encodeURIComponent(k)}&scope=all`);
      const j = (r.ok ? await r.json() : {}) as { fp?: Record<string, unknown> | null };
      if (!j.fp) return dropLearned();
      const shown = ES.mode === "copy" ? ES.refProfile?.shown || "auto" : ES.mode;
      ES.refProfile = { ...j.fp, name: "Learned style", cuts: [], learned: true, byTpl: true, silent: true, shown };
      ES.mode = "copy";
    } catch { /* signed out or offline: the template as it is */ }
  }
  const readBefore = new Map<string, unknown>();
  let stops = 0, read: Clip[] = [], reading = 0, copies: Copy[] = [];
  // the clips' small copies (previewCopyOf), by the clip's name: the editor's player reads them
  let previews = new Map<string, Promise<string | null>>();
  /** a clip's small copy, made before it is read: its motion, scenes and faces are read from it (they are read on
   * 128 x 72 and face-sized frames, so a 960 copy gives the same readings as the 4K file, from one decode of the 4K
   * file instead of two), and the preview plays it. null: none needed, or none made (the clip itself is read). */
  async function smallCopy(name: string, path: string, w: number, h: number, dur: number) {
    const plan = previewCopyOf(w, h, dur);
    if (!plan) return null;
    const known = previews.get(name); if (known) return known;
    const job = (async () => {
      const made = await io.fetch(url("copy", `&p=${encodeURIComponent(path)}&w=${plan.w}&h=${plan.h}&fps=30&b=${plan.bitrate}&gop=0.25`), { method: "POST" });
      return made.ok ? (await made.json() as { path: string }).path : null;
    })().catch(() => null);
    previews.set(name, job);
    return job;
  }
  const url = (path: string, q = "") => `${io.base}/${path}?k=${io.key}${q}`;
  /** a file's sound, read by the phone (SoundReader.kt); it fails when the file has none */
  async function readSound(path: string) {
    const res = await io.fetch(url("sound", `&p=${encodeURIComponent(path)}`));
    if (!res.ok) throw new Error("No sound");
    return pcmOf(await res.arrayBuffer());
  }
  /** where people speak in a sound: the probability of speech every 32 ms (Silero VAD on the phone, Models.kt, as the
   * website's lib/vad); it fails when the model cannot run, and the brain then goes by loudness */
  async function speechProbs(mono: Float32Array, sr: number) {
    const res = await io.fetch(url("speech", `&sr=${Math.round(sr)}`), { method: "POST", body: new Uint8Array(mono.buffer, mono.byteOffset, mono.byteLength) });
    if (!res.ok) throw new Error(await res.text());
    return new Float32Array(await res.arrayBuffer());
  }
  function getCtx() { return { createBuffer: (count: number, n: number, sr: number) => soundOf(Array.from({ length: count }, () => new Float32Array(n)), sr) }; }

  /** a call to Shubix's server, tried 3 times by itself when it could not answer (no answer, 408, 429, 5xx), 1 s then 2 s
   * apart; then it fails and the person gets the popup. A real "no" is answered at once. */
  async function apiFetch(path: string, o: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: unknown } = {}) {
    const stopped = () => !!(o.signal as { aborted?: boolean } | undefined)?.aborted;
    for (let n = 1; ; n++) {
      let r: Response | null = null;
      try {
        const token = await io.token?.();
        r = await io.fetch(io.base + path, { ...o, headers: { ...o.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } } as never) as Response;
        if (r.ok || !(r.status === 408 || r.status === 429 || r.status >= 500)) return r;
      } catch (e) { if ((e as { name?: string })?.name === "AbortError") throw e; }
      if (n >= 3) { if (r) return r; throw new Error("Our team is working on it. Please try again in a little while. No credits were used."); }
      await new Promise((ok) => setTimeout(ok, (io.apiWait ?? 1000) * n));
      if (stopped()) throw Object.assign(new Error("Stopped"), { name: "AbortError" });
    }
  }
  /** the frames Shubix AI looks at, as JPEGs from the phone's own decoder */
  async function aiFrames(src: { name?: string; path: string; w: number; h: number }) {
    const ts = (host.brain.aiTimes(src) as number[]).slice().sort((x, y) => x - y), sc = Math.min(1, 384 / Math.max(src.w, src.h));
    const w = Math.max(2, Math.round(src.w * sc / 2) * 2), h = Math.max(2, Math.round(src.h * sc / 2) * 2);
    // from the clip's small copy when it has one (960 on its long side: the same 384 px pictures, from a key frame every
    // 0.25 s instead of a 4K decode from one up to 2 s before each), else the clip itself
    const small = src.name ? await (previews.get(src.name) ?? null) : null;
    const res = await io.fetch(url("aiframes", `&p=${encodeURIComponent(small ?? src.path)}&w=${w}&h=${h}`), { method: "POST", body: ts.map((t) => t.toFixed(3)).join(",") });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json() as (string | null)[]).map((image, i) => image ? { t: +ts[i].toFixed(2), image } : null).filter(Boolean);
  }
  // the server's AI voices (OpenAI, Gemini: /api/studio/speak, 1 credit a piece), offered after the phone's own languages
  let aiVoices: { key: string; label: string; lang: string }[] | null = null;
  async function voicesNow() {
    if (!aiVoices) try {
      const r = await apiFetch("/api/studio/speak"), j = (r.ok ? await r.json() : {}) as { available?: boolean; voices?: { key: string; label: string }[] };
      aiVoices = j.available ? (j.voices ?? []).map((x) => ({ key: x.key, label: `AI · ${x.label}`, lang: "AI voice" })) : [];
    } catch { return TTS_VOICES; }   // (not reached now: asked again the next time the list is opened)
    return [...TTS_VOICES, ...aiVoices];
  }
  /** the phone's own voice speaks: its samples and rate (SystemVoice.kt); an AI voice ("openai:nova") comes from the server */
  async function speak(text: string, voice: string) {
    if (voice.includes(":")) {
      const r = await apiFetch("/api/studio/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(j.error?.message || (r.status === 402 ? "AI voices are part of the Editor and Pro plans, or use credits." : "The AI voice could not be made. Please try again.")); }
      return pcmOfWav(await r.arrayBuffer());
    }
    const res = await io.fetch(url("speak", `&v=${encodeURIComponent(voiceLanguage(voice))}`), { method: "POST", body: text });
    if (!res.ok) throw new Error(await res.text());
    return { pcm: new Float32Array(await res.arrayBuffer()), sr: Number((res as unknown as { headers?: { get(k: string): string | null } }).headers?.get("X-Sample-Rate")) || 22050 };
  }
  /** the subject pop: a clip's frame at `t` (320x320) and its subject, read by the phone (SubjectPop.kt); null: no frame */
  async function popMask(path: string, t: number) {
    const res = await io.fetch(url("popmask", `&p=${encodeURIComponent(path)}&t=${Math.max(0, t).toFixed(3)}`), { method: "POST", body: "" });
    if (!res.ok) throw new Error(await res.text());
    const b = new Uint8Array(await res.arrayBuffer()), n = 320 * 320;
    if (b[0] !== 1 || b.length < 1 + n * 5) return null;
    return { mask: b.slice(1, 1 + n), rgba: b.slice(1 + n, 1 + n * 5) };
  }
  /** the subject cut out of that frame at w x h with the brain's alpha, kept as a PNG on the phone */
  async function popCut(path: string, t: number, w: number, h: number, alpha: Uint8Array, box: number[]) {
    const res = await io.fetch(url("popcut", `&p=${encodeURIComponent(path)}&t=${Math.max(0, t).toFixed(3)}&w=${w}&h=${h}&box=${box.map((x) => x.toFixed(4)).join(",")}`), { method: "POST", body: alpha });
    if (!res.ok) throw new Error(await res.text());
    return await res.json() as { path: string; w: number; h: number };
  }
  async function analyse(mono: Float32Array, sr: number, opts: Args = {}) {
    const head = new TextEncoder().encode(JSON.stringify({ ...opts, sr })), body = new Uint8Array(4 + head.length + mono.byteLength);
    new DataView(body.buffer).setUint32(0, head.length, true); body.set(head, 4); body.set(new Uint8Array(mono.buffer, mono.byteOffset, mono.byteLength), 4 + head.length);
    const res = await io.fetch(url("song"), { method: "POST", body });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json() as Args & { rmsF: number[]; pfArr: number[]; onEnv: number[] };
    return { ...r, rmsF: Float32Array.from(r.rmsF), pfArr: Float32Array.from(r.pfArr), onEnv: Float64Array.from(r.onEnv) };
  }
  async function song(a: Args) {
    const g = stops, path = String(a.path), name = String(a.name);
    io.task?.("start", "song", "Adding your song", `Reading the sound of ${name.replace(/\.[^.]+$/, "")}`, "music");
    try {
      const res = await io.fetch(url("sound", `&p=${encodeURIComponent(path)}`));
      if (!res.ok) throw new Error("This file has no sound we can read. Try an MP3, M4A or WAV.");
      let { sampleRate, channels, mono } = pcmOf(await res.arrayBuffer());
      // a Reel saved from Instagram: its song without the card Instagram adds at its end (instaCard.ts)
      const end = instaCardStart(mono, sampleRate);
      if (end !== null) { const n = Math.max(1, Math.floor(end * sampleRate)); mono = mono.slice(0, n); channels = channels.map((c) => c.slice(0, n)); }
      if (stops !== g) throw new Error("Stopped");
      io.task?.("progress", "song", undefined, "Finding the beats, drops and breaks");
      const r = await analyse(mono, sampleRate);
      if (stops !== g) throw new Error("Stopped");
      await host.setSong({ channels, mono, r, name, sampleRate });
      io.task?.("done", "song", "Song ready");
      return facts();
    } catch (e) { io.task?.(stops !== g ? "clear" : "fail", "song", e instanceof Error ? e.message : "The song could not be read"); throw e; }
  }
  /** frames of a video as pixels, read by the phone (FileServer.kt /frames), in the order of the times. The website takes the
   * frame showing at a time (the last one at or before it), the phone's decoder the first one at or after it: each time is
   * asked a frame earlier, so both read the same frame (refReader.ts reads them alike). 150 at a time (some 4 MB). */
  async function framesOf(path: string, w: number, h: number, fps: number, ts: number[]): Promise<(Pic | null)[]> {
    const out: (Pic | null)[] = new Array(ts.length).fill(null), back = 1 / (fps > 1 ? fps : 30) - 0.0085, size = w * h * 4;
    for (let k = 0; k < ts.length; k += 150) {
      const part = ts.slice(k, k + 150).map((t, i) => [Math.max(0, t - back), k + i] as const).sort((x, y) => x[0] - y[0]);
      const res = await io.fetch(url("frames", `&p=${encodeURIComponent(path)}&w=${w}&h=${h}`), { method: "POST", body: part.map((x) => x[0].toFixed(4)).join(",") });
      if (!res.ok) throw new Error(await res.text());
      const b = new Uint8Array(await res.arrayBuffer()); let o = 0;
      for (const [, i] of part) { if (o >= b.length) break; const got = b[o++] === 1; if (got) { if (o + size > b.length) break; out[i] = { width: w, height: h, data: b.subarray(o, o + size) }; o += size; } }
    }
    return out;
  }
  /** a frame's colour look, as the website reads it (lookOfImage): a 96-wide copy for colours, a 96 x 96 crop at full size for grain */
  function lookOfPic(p: Pic) {
    const cw = 96, ch = Math.max(2, Math.round(96 * p.height / p.width)), small = new Uint8Array(cw * ch * 4), crop = new Uint8Array(96 * 96 * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const x0 = Math.floor(x * p.width / cw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * p.width / cw)), y0 = Math.floor(y * p.height / ch), y1 = Math.max(y0 + 1, Math.floor((y + 1) * p.height / ch));
      const s = [0, 0, 0]; let n = 0;
      for (let yy = y0; yy < y1; yy += 2) for (let xx = x0; xx < x1; xx += 2) { const i = (yy * p.width + xx) * 4; s[0] += p.data[i]; s[1] += p.data[i + 1]; s[2] += p.data[i + 2]; n++; }
      const o = (y * cw + x) * 4; small[o] = s[0] / n; small[o + 1] = s[1] / n; small[o + 2] = s[2] / n; small[o + 3] = 255;
    }
    const cx = Math.max(0, Math.round(p.width / 2 - 48)), cy = Math.max(0, Math.round(p.height / 2 - 48));
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const i = (Math.min(p.height - 1, cy + y) * p.width + Math.min(p.width - 1, cx + x)) * 4, o = (y * 96 + x) * 4; crop[o] = p.data[i]; crop[o + 1] = p.data[i + 1]; crop[o + 2] = p.data[i + 2]; crop[o + 3] = 255; }
    return lookStats(small, cw, ch, crop);
  }
  /** Copy a Reel, what is written and stuck on it (the website's refLookRun): with Shubix AI on, 10 small frames go to
   * /api/studio/ref-look; its texts' places (never its words), stickers and caption style are put on the new Reel once it
   * is made (refLookApply). */
  let refLook: Promise<void> | null = null;
  async function readRefLook(path: string, R: Record<string, any>) {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const ES = host.ES, V = host.values as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!ES.aiOn) return;
    if (!V.aiReelOk?.() && !(await V.aiGate?.())) return;   // Shubix AI only after the Reel's gate (Use), as everything else
    try {
      io.task?.("start", "reflook", "Reading its texts and stickers", "Shubix AI looks at 10 frames", "ai");
      const N = 10, ts = Array.from({ length: N }, (_, i) => +((i + 0.5) * R.dur / N).toFixed(2)), sc = Math.min(1, 512 / Math.max(R.w, R.h));
      const w = Math.max(2, Math.round(R.w * sc / 2) * 2), h = Math.max(2, Math.round(R.h * sc / 2) * 2);
      const res = await io.fetch(url("aiframes", `&p=${encodeURIComponent(path)}&w=${w}&h=${h}`), { method: "POST", body: ts.map((t) => t.toFixed(3)).join(",") });
      if (!res.ok) throw new Error(await res.text());
      const frames = (await res.json() as (string | null)[]).map((image, i) => image ? { t: ts[i], image } : null).filter(Boolean);
      if (frames.length < 2) throw new Error("frames not readable");
      const r = await apiFetch("/api/studio/ref-look", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(R.name).slice(0, 200), dur: R.dur, frames }) });
      const j = await r.json().catch(() => ({})) as { error?: { message?: string } };
      if (!r.ok) throw new Error(j.error?.message || `Shubix could not do this step (${r.status}).`);
      if (ES.refProfile !== R) return;   // another Reel was picked meanwhile
      R.design = j; R.designDone = false;
      io.task?.("done", "reflook", "Its texts and stickers read");
    } catch (e) { io.task?.("fail", "reflook", "Its texts could not be read this time"); console.warn("reference texts not read:", e); }
  }
  /** the texts' places, stickers and caption style on the Reel just made (the website's refLookApply, the same numbers) */
  // the copied Reel's photo boxes (boxes.ts) on the new Reel's long shots, as on the website: no AI, no credits
  async function refBoxes() {
    const ES = host.ES, R = ES.refProfile;
    if (!R || !(R.boxes || []).length || R.boxesDone || ES.mode !== "copy" || !ES.edit?.length || ES.layers.some((L: { boxes?: string }) => L.boxes)) return;
    R.boxesDone = true; try { await host.brain.photoBoxes(0, "ref"); } catch { /* the Reel goes on without them */ }
  }
  function applyRefLook() {
    const ES = host.ES, R = ES.refProfile, V = host.values as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!R || !R.design || R.designDone || ES.mode !== "copy" || !ES.edit?.length) return;
    const D = R.design, L = V.reelLen?.() || ES.buf?.duration || 0; if (!L) return;
    R.designDone = true;
    const clip = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
    const k = L / Math.max(0.5, R.dur), base = Math.min(R.w, R.h * 0.5625);
    const sizeOf = (hf: number, emoji: boolean) => clip(emoji ? hf * R.h / (base * 0.16) : hf * R.h / 0.75 / (base * 0.075), 0.4, 2.6);
    const timing = (x: { t0: number; t1: number }) => { const whole = x.t0 <= 0.05 && x.t1 >= R.dur - 0.05, t0 = whole ? 0 : Math.max(0, Math.min(L - 0.5, x.t0 * k));
      return { all: whole, t0, t1: whole ? L : Math.min(L, Math.max(t0 + 0.5, x.t1 * k)), ref: true }; };
    ES.overlays = ES.overlays.filter((o: { ref?: boolean }) => !o.ref);   // an earlier reference's texts go
    // only the format is copied, never the other Reel's words: each place waits for the creator's own (ph: left out of the video)
    for (const x of D.texts || []) ES.overlays.push({ id: ++ES.ovSeq, text: "YOUR TEXT", emoji: false, style: x.style, color: x.color, anim: x.anim, x: x.x, y: x.y, size: sizeOf(x.h, false), ...timing(x), ph: true });
    for (const x of D.stickers || []) ES.overlays.push({ id: ++ES.ovSeq, text: x.emoji, emoji: true, x: x.x, y: x.y, size: sizeOf(x.h, true), ...timing(x) });
    if (D.captions) { if (D.captions.style) ES.textStyle = D.captions.style; if (D.captions.color) ES.ACCENT = D.captions.color;
      if (!ES.capsOn) void host.setCaptions(true, undefined, undefined).catch(() => { ES.capsOn = false; }); }
    ES.ovSel = -1;
  }
  /** Copy a Reel: the Reel picked is read as the website reads it (video-engine refReader.ts): its cuts and what kind each
   * is, its shots, moves, speeds and look, on its own music's beats. The Reel made next copies its format, never its words. */
  async function ref(a: Args) {
    const g = stops, path = String(a.path), name = String(a.name), ES = host.ES;
    const say = (p: number, what: string) => { io.task?.("progress", "ref", undefined, `Reading the Reel: ${what}`, undefined, p); io.onProgress?.("song", p); };
    io.task?.("start", "ref", "Reading the Reel to match", "Its cuts, transitions and look", "copy");
    try {
      const probe = await io.fetch(url("probe", `&p=${encodeURIComponent(path)}`));
      if (!probe.ok) throw new Error("This video cannot be read here. Please pick another Reel.");
      const f = await probe.json() as { dur: number; w: number; h: number; fps?: number; size?: number };
      let dur = f.dur; const { w, h } = f, fps = f.fps || 30;
      if (!(dur > 1) || !w || !h) throw new Error("This video cannot be read here. Please pick another Reel.");
      say(0.02, "listening to its music");
      let rb: number[] | null = null, rr: Record<string, unknown> | null = null, rmap: unknown = null, audio: unknown = null;
      try {
        const s = await readSound(path); let m = s.mono;
        // saved from Instagram: the card at its end is Instagram's, not the editor's last shot (nor a black end, nor a name to copy)
        const end = instaCardStart(m, s.sampleRate); if (end !== null && end > 1) { m = m.slice(0, Math.floor(end * s.sampleRate)); dur = Math.min(dur, end); }
        const r = await analyse(m, s.sampleRate) as unknown as Record<string, unknown> & { beats?: number[] };
        if (r.beats && r.beats.length > 8) rb = r.beats;
        audio = { mono: m, sr: s.sampleRate, curve: onsetCurve(m, s.sampleRate) };   // where it is in the creator's song
        rr = r; try { rmap = soundMap(m, s.sampleRate); } catch { rmap = null; }
      } catch { /* no soundtrack: pace in seconds */ }
      if (stops !== g) throw new Error("Stopped");
      say(0.05, "finding its cuts");
      const scan = lastLine(await (await io.fetch(url("scan", `&p=${encodeURIComponent(path)}&dur=${dur}`), { method: "POST" })).text(), "{") as { samples: unknown[]; scenes: unknown[] };
      if (stops !== g) throw new Error("Stopped");
      const SW = 64, SH = Math.max(8, Math.round(64 * h / w)), LW = Math.min(w, 1080), LH = Math.max(2, Math.round(LW * h / w));
      const read = await readReel({ dur, small: (ts) => { if (stops !== g) throw new Error("Stopped"); return framesOf(path, SW, SH, fps, ts); },
        looks: async (ts) => { const out = []; for (const t of ts) { const [p] = await framesOf(path, LW, LH, fps, [t]); out.push(p ? lookOfPic(p) : null); } return out; },
        scenes: scan.scenes || [], samples: scan.samples || [], rb, rr, rmap, describeCut: describeCut as never, onP: say });
      if (stops !== g) throw new Error("Stopped");
      ES.refProfile = { name, key: `${name}|${f.size ?? 0}`, audio, w, h, ...read };
      ES.layers = (ES.layers || []).filter((L: { boxes?: string }) => L.boxes !== "ref");   // the last Reel's photo boxes go with it
      // the copied look is on while it is matched (the edit then matches it), as on the website
      const V = host.values as { GRADES?: Record<string, unknown> };
      if (V.GRADES) V.GRADES.copy = { con: 1, sat: 1, bri: 1, warm: 0, teal: 0, mono: read.look && read.look.sat < 0.05 ? 1 : 0, lift: 0, vig: 0, grain: 0 };
      ES.copyLookKey = ""; ES.copyLookScore = null; ES.look = "copy"; ES.mode = "copy";
      io.task?.("done", "ref", "Reel read");
      refLook = readRefLook(path, ES.refProfile);   // its texts and stickers, while the clips are added
      return { cuts: read.cuts.length, shots: read.moments.length, bpm: Math.round(read.bpm), trans: read.trans };
    } catch (e) { io.task?.(stops !== g ? "clear" : "fail", "ref", e instanceof Error ? e.message : "We could not read that Reel. Please try another video."); throw e; }
  }
  const facts = () => { const r = host.ES.song.r as { period: number; beats: number[]; cutType: string[] }, n = (k: string) => r.cutType.filter((t) => t === k).length; return { duration: host.ES.buf.duration, bpm: Math.round(60 / r.period), beats: r.beats.length, drops: n("drop"), breaks: n("break") }; };

  /** My Reels with room left for this person (read at most once a minute); null: not offered */
  let room: { used: number; limit: number } | null = null, roomAt = 0;
  async function myReelsRoom() {
    if (Date.now() - roomAt > 60_000) {
      roomAt = Date.now();
      try { const r = await apiFetch("/api/studio/reels"); room = r.ok ? (await r.json() as { usage: { used: number; limit: number } }).usage : null; } catch { room = null; roomAt = 0; }
    }
    return room && room.limit > room.used ? room : null;
  }
  /** A finished Reel into My Reels: straight to storage in parts, three at a time, each tried four times. */
  async function saveToMyReels(path: string, name: string) {
    if (!io.readBytes) throw new Error("My Reels is not available here");
    const probe = await io.fetch(url("probe", `&p=${encodeURIComponent(path)}`));
    if (!probe.ok) throw new Error("The Reel could not be read");
    const f = await probe.json() as ClipFacts, size = f.size ?? 0;
    const send = async (to: string, method: string, body?: Args) => {
      const r = await apiFetch(to, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!r.ok) { const e = await r.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(e?.error?.message || "That did not work. Please try again."); }
      return r.json();
    };
    const start = await send("/api/studio/reels", "POST", { name, dur: Math.round(f.dur * 10) / 10, width: f.w, height: f.h, fps: Math.round(f.fps || 30), size, type: "video/mp4" }) as
      { id: string; direct: true; partSize: number; parts: { n: number; url: string }[] } | { id: string; direct: false; uploadUrl: string };
    try {
      if (start.direct) {
        const tags: { n: number; etag: string }[] = [], queue = [...start.parts];
        const put = async (at: string, a: number) => {
          for (let tries = 0; ; tries++) {
            try {
              const r = await io.fetch(at, { method: "PUT", body: await io.readBytes!(path, a, Math.min(size - a, start.partSize)) }), tag = (r as unknown as { headers?: { get(k: string): string | null } }).headers?.get("etag");
              if (!r.ok || !tag) throw new Error(`part ${r.status}`);
              return tag;
            } catch (e) { if (tries >= 3) throw e; await new Promise((ok) => setTimeout(ok, 1000 * 2 ** tries)); }
          }
        };
        const worker = async () => { for (let q = queue.shift(); q; q = queue.shift()) tags.push({ n: q.n, etag: await put(q.url, (q.n - 1) * start.partSize) }); };
        await Promise.all([worker(), worker(), worker()]);
        return await send(`/api/studio/reels/${start.id}/complete`, "POST", { parts: tags });
      }
      const up = await apiFetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: await io.readBytes(path, 0, size) });
      if (!up.ok) throw new Error(`upload ${up.status}`);
      return await send(`/api/studio/reels/${start.id}/complete`, "POST", { parts: [] });
    } catch {
      await apiFetch(`/api/studio/reels/${start.id}`, { method: "DELETE" }).catch(() => {});
      throw new Error("Your Reel is saved on your phone, but it could not be saved to My Reels. Please try again.");
    }
  }

  async function readClip(c: Clip) {
    // a photo is first made a short moving clip, as on the website (PhotoClip.kt): the phone reads a size and frames only
    // from a video. A file that is no video, with no photo's ending, is tried as a photo too.
    const probeOf = (path: string) => io.fetch(url("probe", `&p=${encodeURIComponent(path)}`));
    let from = c.path, photo = PHOTO.test(c.name) || PHOTO.test(c.path), probe = photo ? null : await probeOf(from);
    if (!probe?.ok) {
      const made = await io.fetch(url("photo", `&p=${encodeURIComponent(c.path)}`), { method: "POST" });
      if (made.ok) { from = (await made.json() as { path: string }).path; photo = true; probe = await probeOf(from); }
    }
    if (!probe?.ok) throw new Error(photo ? `This photo cannot be read: ${c.name}. Use JPG, PNG or WEBP.` : `This clip cannot be read: ${c.name}`);
    const p = `&p=${encodeURIComponent(from)}`;
    const facts = await probe.json() as ClipFacts, { w, h } = facts, plan = editCopyOf(facts);
    // its footage ends with its last picture (the sound often runs on, and a shot there stood still before its cut)
    let dur = facts.end && facts.end > 0.3 && facts.end < facts.dur - 0.04 ? facts.end : facts.dur;
    // a heavy clip: its edit copy is what is read, previewed and exported (no copy made: the original goes on)
    let path = from, W = w, H = h;
    if (photo) copies.push({ name: c.name, path, w, h, photo: dur });
    if (plan) {
      const made = await io.fetch(url("copy", `${p}&w=${plan.w}&h=${plan.h}&fps=30&b=${plan.bitrate}`), { method: "POST" });
      if (made.ok) { path = (await made.json() as { path: string }).path; W = plan.w; H = plan.h; copies.push({ name: c.name, path, w: plan.w, h: plan.h }); }
    }
    // the reading's own small copy (smallCopy): what is read is the same picture, at the size the reading uses
    const look = photo ? null : await smallCopy(c.name, path, W, H, dur);
    const q = `&p=${encodeURIComponent(look ?? path)}&dur=${dur}`;
    const scan = lastLine(await (await io.fetch(url("scan", q), { method: "POST" })).text(), "{");
    let raw: { t: number; rects: unknown[] }[] = [];
    try { raw = lastLine(await (await io.fetch(url("faces", `${q}&w=${W}&h=${H}`), { method: "POST" })).text(), "["); } catch { /* no faces read: the Reel is still made */ }
    // a last picture repeated to the end: its footage ends where it stops moving (video-engine clipUse.ts)
    const still = photo ? dur : stillEnd(scan.samples, dur);
    if (still < dur) { dur = still; scan.samples = scan.samples.filter((s: { t: number }) => s.t < still - 1e-6); }
    const src = host.addClip({ name: c.name, path, soundPath: from, dur, w: W, h: H, samples: scan.samples, scenes: scan.scenes, faces: host.brain.trackFaces(raw), faceHow: "blazeface" });
    // reactions in the clip's own sound (cheers, laughs: video-engine reactions.ts), read once with the clip
    try { const s = await readSound(from); src.reacts = reactionsOf(s.mono, s.sampleRate); } catch { src.reacts = []; }
    readBefore.set(c.name, src);
    return src;
  }
  async function clips(a: Args) {
    const list = a.paths as Clip[], g = stops, names = list.map((c) => c.name);
    // what was read stays read, by the clip's name: a clip added, taken out or moved never reads the others again
    host.ES.sources.length = 0;
    for (const c of list) { const known = readBefore.get(c.name); if (known) host.ES.sources.push(known); }
    const fresh = list.filter((c) => !readBefore.has(c.name));
    const failed: string[] = []; let lastError: unknown;
    reading++;
    if (fresh.length) io.task?.("start", "clips", "Reading your clips", `Finding the best moments in ${fresh.length} clip${fresh.length > 1 ? "s" : ""}`, "clips");
    try {
      for (let i = 0; i < fresh.length; i++) {
        if (stops !== g) break;
        io.task?.("progress", "clips", undefined, `Clip ${i + 1} of ${fresh.length}`, undefined, i / fresh.length);
        // a clip that cannot be read is named on its own card: the others go on
        try { const src = await readClip(fresh[i]); io.clipDone?.(fresh[i].name, true, PHOTO.test(fresh[i].name) ? null : bestMoment(src?.samples, src?.dur, src?.faces)); }
        catch (e) { failed.push(fresh[i].name); lastError = e; io.clipDone?.(fresh[i].name, false); }
        io.onProgress?.("clips", (i + 1) / fresh.length);
      }
      if (stops === g && !host.ES.sources.length && lastError) throw lastError;
      io.task?.(stops !== g ? "clear" : "done", "clips", `${host.ES.sources.length} clip${host.ES.sources.length > 1 ? "s" : ""} ready`);
    } catch (e) { io.task?.("fail", "clips", e instanceof Error ? e.message : "The clip could not be read"); throw e; }
    finally { reading--; }
    host.ES.sources.sort((x: { name: string }, y: { name: string }) => names.indexOf(x.name) - names.indexOf(y.name));
    read = list;
    if (stops === g) host.makeReel();
    return { clips: host.ES.sources.length, names: host.ES.sources.map((s: { name: string }) => s.name), failed };
  }
  const kfRow = () => { const T = host.brain.kfTarget(); return T ? { ok: true, index: T.i, what: T.what, a: T.a, b: T.b, keyframes: ((T.obj.uk || []) as Args[]).map((k) => ({ ...k })) } : null; };
  function state(){ host.brain.clearTexts?.(); return ({ edit: host.brain.editOf(), overlays: host.ES.overlays, mode: host.ES.mode, settings: { au: host.ES.au, capsOn: !!host.ES.capsOn, caplang: host.ES.capLang ?? "", captr: host.ES.trTo ?? "", textStyle: host.ES.textStyle ?? "pop" } }); }
  const work = () => ({ clips: host.ES.sources.length, shots: host.ES.edit.length, songReady: !!host.ES.song?.r, pending: reading });

  const ops: Record<string, (a: Args) => unknown> = {
    setup: async () => { signedIn = true; return { ok: true, ai: await host.account().catch(() => false) }; },
    song,
    ref,
    songAgain: () => { if (!host.ES.song?.r) throw new Error("Add your song again"); return facts(); },
    advice: (a) => clipAdvice(host.ES.song?.r ? host.ES.plan : null, a.pick === "photos" || a.pick === "mix" ? a.pick : a.photo === true ? "photos" : "videos"),
    cancel: () => { stops++; return { ok: true }; },
    clips,
    choose: async (a) => {
      // a Reel the creator is copying stays the copy under "auto" (a style asked in words still changes it)
      if (a.mode) { const R = host.ES.refProfile; host.ES.mode = a.mode === "auto" && R && !R.learned ? "copy" : String(a.mode); }
      if (a.template !== undefined) await templateKind(String(a.template));
      if (a.order) host.ES.seqOn = a.order === "order";
      if (a.text) { host.ES.hookNone = a.text === "none"; if (a.text === "auto") { host.ES.autoHookOff = false; host.ES.autoHookUsed = false; } else host.ES.overlays = host.ES.overlays.filter((o: { auto?: boolean }) => !o.auto); }   // Opening text (engine.ts setHookPref alike)
      if (a.aspect) host.ES.aspect = String(a.aspect);
      if (a.length !== undefined) { host.sec.len = Number(a.length); host.sec.auto = true; await host.useSection(); }
      else host.makeReel();
      return { mode: host.ES.mode, start: host.ES.secStart ?? 0 };
    },
    part: async (a) => { host.sec.start = Number(a.start); host.sec.auto = false; await host.useSection(); return { start: host.ES.secStart ?? 0 }; },
    // the Reel is made: what is written on the Reel being copied goes on it (its reading waited for, a minute at most)
    ready: async () => { if (refLook) { const r = refLook; await Promise.race([r, new Promise((ok) => setTimeout(ok, 60_000))]); } applyRefLook(); await refBoxes(); return { work: work(), state: state() }; },
    // the edit's own review (shared/video-engine review.ts) and how many takes and repairs it had: read only
    review: () => ({ review: host.brain.editReview?.() ?? null, takes: host.ES.editTakes ?? null }),
    // the finished video read back on this phone (its clip scan) and checked against the edit (video-engine
    // exportCheck.ts): a stalled decoder, black where footage belongs or a short file. null: no edit to check against
    checkExport: async (a) => {
      type Shot = { start: number; end: number; src: number; in: number; scaleR?: number; sp?: { pos: (l: number) => number } };
      const edit = (host.ES.edit ?? []) as Shot[];
      if (!edit.length) return { verdict: null };
      const t0 = edit[0].start, want: ExportExpect = { dur: edit[edit.length - 1].end - t0, cuts: edit.slice(1).map((e) => e.start - t0), dark: [] };
      for (const e of edit) {   // the shots the edit knows are dark (a night clip): black there is the footage
        const src = host.ES.sources[e.src], need = (e.sp ? e.sp.pos(e.end - e.start) : e.end - e.start) * (e.scaleR || 1);
        if (src && windowStats(src, e.in, e.in + Math.max(need, 0.05)).dark > 0.5) want.dark!.push([e.start - t0, e.end - t0]);
      }
      const p = `&p=${encodeURIComponent(String(a.path))}`;
      try {
        const probe = await io.fetch(url("probe", p));
        if (!probe.ok) return { verdict: checkExportedReel({ dur: 0, w: 0, h: 0, samples: [] }, want) };
        const { dur, w, h } = await probe.json() as { dur: number; w: number; h: number };
        const scan = lastLine(await (await io.fetch(url("scan", `${p}&dur=${dur}`), { method: "POST" })).text(), "{") as { samples?: { t: number; b: number; m: number }[]; scenes?: { t0: number; t1: number }[] };
        return { verdict: checkExportedReel({ dur, w, h, samples: scan.samples ?? [], scenes: scan.scenes ?? [] }, want) };
      } catch { return { verdict: checkExportedReel({ dur: 0, w: 0, h: 0, samples: [] }, want) }; }
    },
    state,
    edit: (a) => { const list = a.shots as Args[]; if (list.length) { const last = list[list.length - 1]; if (Number(last.end) < host.ES.buf.duration) last.end = host.ES.buf.duration; } const ok = !!host.brain.restoreEdit(list) || true; if (Array.isArray(a.overlays)) host.ES.overlays = a.overlays; return { ok }; },
    shotCs: () => host.brain.shotCs(),
    shotSet: (a) => { host.brain.shotSet(a.patch ?? null); return { ok: true, state: state() }; },
    shotOp: (a) => ({ ok: !!host.brain.shotOp(String(a.op), a.arg), state: state() }),
    shotSlip: (a) => ({ ok: host.brain.shotSlip(Number(a.delta) || 0), state: state() }),
    shotTrim: (a) => ({ ok: host.brain.shotTrim(Number(a.direction) || 1), state: state() }),
    seek: (a) => { host.ES.pos = Math.max(0, Number(a.time) || 0); return { time: host.ES.pos }; },
    remix: () => { host.brain.remixNow?.(); return { ok: true, state: state() }; },
    aiState: async () => { if (!signedIn) { signedIn = true; await host.account().catch(() => false); } return { on: !!host.ES.aiOn }; },
    /** the good footage in the clips read, in whole seconds, and the Reel's length: enough clips? */
    footage: () => { const exact = host.ES.sources.reduce((t: number, c: Parameters<typeof goodSecs>[0]) => t + goodSecs(c), 0) as number;
      return { have: Math.floor(host.ES.sources.length > 1 && !host.ES.seqOn && exact >= 10 ? exact * 0.85 : exact), exact, clips: host.ES.sources.length as number, period: Number(host.ES.song?.r?.period) || 0, need: (host.ES.buf?.duration as number | undefined) ?? 0 }; },
    /** Shubix AI's price for this Reel and the person's balance, read again each time: shown before Make Reel */
    aiPrice: async () => { signedIn = true; await host.account().catch(() => false); return { on: !!host.ES.aiOn, cost: host.brain.aiCostOf("reel") as number, balance: host.brain.aiBal() as number | null, paid: host.ES.planNow !== "free" }; },
    /** Make Reel was pressed with the price on the screen: that is the person's answer, so nothing is asked again */
    ai: async () => {
      // asked again at every Make Reel: an earlier check that failed (signed in a moment later, no network) left
      // Shubix AI off for the whole session, with no word of it
      signedIn = true; await host.account().catch(() => false);
      if (!host.ES.aiOn) { aiWhyOff(); return { went: true }; }   // the phone's own edit, and Ask Shubix says why
      // Make Reel is the person's answer: a Reel whose clips or song changed after the last AI Reel is made by the AI
      // again (aiHeldBack held it back without a word, and the phone's own edit came out instead)
      host.ES.regenOk = true;
      const g = stops, id = host.brain.reelIdNow(), cost = host.brain.aiCostOf("reel") as number, balance = host.brain.aiBal() as number | null;
      const low = !!cost && balance !== null && balance < cost;
      if (low && host.ES.planNow !== "free") return { went: false };   // a plan's Reel is made by Shubix AI only: it waits for credits
      if (low) host.ES.lowAsked = id; else host.ES.aiReel = id;
      host.ES.aiDown = false; host.ES.aiGaveUp = "";
      const went = await host.runAi();
      // Shubix AI could not be reached for a minute: no Reel from the phone's own edit; Make Reel says so (a popup)
      if (host.ES.aiDown) throw new Error("Our team is working on it. Please try again in a little while. No credits were used.");
      return { went: went && stops === g };
    },
    newReel: () => { host.brain.newReel?.(); host.ES.regenOk = true; host.ES.chatUsed = 0; host.ES.reelId = ""; host.ES.aiReel = ""; host.ES.gateNo = ""; host.ES.director = null; return { ok: true }; },
    keptOldReel: () => ({ ok: true }),
    // the plan shot by shot, as the website's Shubix AI report (planData): the clip and what is in it, its transition,
    // effect, speed and keyframes (it was sent with no lines, so Ask Shubix showed only the story)
    aiPlan: () => {
      const d = host.ES.director; if (!d || !d.slots || d.interim) return null;
      const plan = (host.ES.plan || []) as unknown[];
      let lines: string[] = [];
      // the shots the Reel really shows (shotLines: "one true shot plan"); the AI's plan lines only while there is no edit
      try { lines = host.ES.edit?.length ? host.brain.shotLines() : plan.map((s, i) => String(host.brain.planLine(s, i, d.slots)).split("\n").filter(Boolean).join(" · ")); } catch { lines = []; }
      return { story: d.story || "", lines };
    },
    history: () => (host.ES.chatMsgs || []).filter((m: { log?: boolean }) => m.log).slice(-40).map((m: { at?: number; text: string }) => ({ at: m.at || Date.now(), me: false, text: m.text })),
    undo: () => ({ ok: !!host.brain.histGo(true), state: state() }),
    redo: () => ({ ok: !!host.brain.histGo(false), state: state() }),
    kfSet: (a) => { host.brain.kfSet(a.values); return { ok: true }; },
    audioMix: (a) => { host.ES.au = { ...host.ES.au, ...(a as object), ...("mfout" in a ? { mfoutManual: true } : {}) }; host.ES.clipMixKey = ""; host.brain.applyVo(); return host.ES.au; },
    sfx: (a) => { host.ES.pos = Math.max(0, Number(a.time) || 0); host.brain.sfxAdd(String(a.kind)); return { ok: true }; },
    mark: (a) => { host.ES.pos = Math.max(0, Number(a.time) || 0); const f = ({ add: host.brain.addMark, del: host.brain.delMark, clear: host.brain.clearMarks } as Record<string, () => void>)[String(a.op)]; if (!f) return { ok: false }; const ok = (f as (t: number) => unknown)(host.ES.pos) !== false; return { ok, state: state() }; },
    shotStyle: (a) => { const i = host.brain.segAt(host.ES.pos), e = host.ES.edit[i]; if (!e) throw new Error("There is no selected shot"); if (a.kind === "transition") e.tr = String(a.value); else if (a.kind === "effect") e.efx = String(a.value); return { ok: true, state: state() }; },
    exportOptions: async (a) => {
      const base = host.exportOptions(a) as Args, u = await myReelsRoom();
      return u ? { ...base, myReels: true, myReelsNote: `Also kept in your account, to watch, download or share anywhere · ${u.used} of ${u.limit} used` } : base;
    },
    saveToMyReels: (a) => saveToMyReels(String(a.path), String(a.name || "reel.mp4")),
    copies: () => copies,
    /** the clips' preview copies (by the clip's name; null: none), waited for at most `wait` seconds in all */
    previews: async (a) => {
      const wait = Math.max(0, Number(a.wait ?? 180)) * 1000, end = new Promise<null>((ok) => setTimeout(() => ok(null), wait));
      const out: Args = {};
      for (const [name, job] of previews) out[name] = await Promise.race([job, end]);
      return out;
    },
    layerList: () => host.ES.layers.map((L: Args & { m: number; mk?: { w?: number; h?: number; th?: number; f?: number; a?: number; inv?: boolean }; key?: { on?: boolean; c?: string; tol?: number }; followOffsetX?: number; followOffsetY?: number; s: number; op: number; r: number }, index: number) => {
      const M = host.ES.lmedia[L.m as number] as { path?: string; kind?: string } | undefined;
      return { index, id: L.id, t0: L.t0, t1: L.t1, x: L.x, y: L.y, scale: L.s, opacity: L.op, rotation: L.r, mask: L.mask, blend: L.blend || "source-over", follow: L.follow || "none", followOffsetX: L.followOffsetX || 0, followOffsetY: L.followOffsetY || 0,
        maskWidth: L.mk?.w ?? 0.8, maskHeight: L.mk?.h ?? 0.8, maskThreshold: L.mk?.th ?? 0.5, maskFeather: L.mk?.f ?? 0.12, maskAngle: L.mk?.a ?? 0, maskInverted: !!L.mk?.inv, chromaKey: !!L.key?.on, chromaColor: L.key?.c ?? "#00FF00", chromaTolerance: L.key?.tol ?? 0.35,
        native: M?.path || FILL_KINDS.includes(String(M?.kind)) ? { path: M?.path || "", kind: M?.kind, t0: L.t0, t1: L.t1, in: L.in, x: L.x, y: L.y, s: L.s, r: L.r, op: L.op, fh: L.fh, fv: L.fv, fin: L.fin, fout: L.fout, crop: L.crop, mask: L.mask, mk: L.mk, rad: L.rad, key: L.key, blend: L.blend, ...(L.grow ? { grow: L.grow } : {}), ...(L.shade ? { shade: L.shade } : {}), ...(L.ratio ? { ratio: L.ratio } : {}), ...(L.pulses ? { pulses: L.pulses } : {}), ...(L.bump ? { bump: L.bump } : {}), ...(L.edge ? { edge: L.edge, edgeC: L.edgeC || "#FFFFFF" } : {}) } : null, pop: L.pop || null, brand: L.brand || null, finish: L.finish || null };
    }),
    layerAdd: async (a) => {
      const path = String(a.path), name = String(a.name || "overlay"), p = await io.fetch(url("probe", `&p=${encodeURIComponent(path)}`));
      const video = /\.(mp4|mov|m4v|3gp|webm|mkv)$/i.test(name) && p.ok, facts = video ? await p.json() as { dur: number; w: number; h: number } : { dur: 0, w: Number(a.w) || 1080, h: Number(a.h) || 1080 };
      await host.brain.layerAdd([{ kind: video ? "video" : "photo", path, name, ...facts }]);
      return { ok: true, count: host.ES.layers.length };
    },
    /** My brand from the app: the @handle, the logo's file on the phone and its size, the logo in the corner, the end card */
    brandSet: async (a) => {
      const b = a && (a.handle || a.logoPath) ? { handle: String(a.handle || "").slice(0, 40), logoPath: a.logoPath ? String(a.logoPath) : null, logoW: Number(a.logoW) || 512, logoH: Number(a.logoH) || 512, mark: a.mark !== false, end: a.end !== false } : null;
      brand = b; host.ES.brand = b; host.ES.brandOff = { mark: false, end: false };
      if (host.ES.edit.length) await host.brain.brandFinish();
      return { ok: true, brand: b };
    },
    finish: (a) => { const what = String(a.what); if (!["bars", "tint", "bw"].includes(what)) throw new Error("No such finish"); return { ok: !!host.brain.finishSet(what, a.on !== false), on: { bars: !!host.brain.finishOn("bars"), tint: !!host.brain.finishOn("tint"), bw: !!host.brain.finishOn("bw") } }; },
    finishState: () => ({ bars: !!host.brain.finishOn("bars"), tint: !!host.brain.finishOn("tint"), bw: !!host.brain.finishOn("bw") }),
    subjectPop: async () => { const r = await host.brain.subjectPop(false); return { ok: !!r, ...(r || {}), count: host.ES.layers.length }; },
    layerSelect: async (a) => ({ ok: !!(await host.brain.lySelect(Number(a.index))), selected: Number(a.index) }),
    layerSet: (a) => { host.brain.lySet(String(a.key), a.value); return { ok: true }; },
    layerDelete: () => ({ ok: host.brain.lyDelete() }),
    ttsVoices: () => voicesNow(),
    ttsAdd: (a) => host.addTtsAtPlayhead(String(a.text || ""), String(a.voice || "")),
    ttsClear: () => ({ ok: host.brain.clearTts() }),
    captions: (a) => host.setCaptions(!!a.enabled, a.language === undefined ? undefined : String(a.language), a.translation === undefined ? undefined : String(a.translation)),
    captionStyle: (a) => { host.ES.textStyle = String(a.style || "pop"); return { style: host.ES.textStyle }; },
    template: (a) => { host.ES.pos = Math.max(0, Number(a.time) || 0); return { ok: host.addTemplate(String(a.key), undefined, host.ES.pos, undefined, false) > 0, state: state() }; },
    shotReverse: async () => ({ ok: await host.brain.shotReverse(), state: state() }),
    shotExtract: async () => { const e = host.ES.edit[host.brain.segAt(host.ES.pos)], s = e && host.ES.sources[e.src]; if (!s) return { ok: false }; await song({ path: s.path, name: s.name }); return { ok: true }; },
    kfSeek: async (a) => { await host.brain.kfSeek(Math.max(0, Number(a.time) || 0)); return kfRow(); },
    kfEase: (a) => { const T = host.brain.kfTarget(), k = T && host.brain.kfAtHead(T); if (!k) throw new Error("Select a keyframe first"); k.ez = String(a.easing || "inOut"); return kfRow(); },
    kfRemove: () => { const T = host.brain.kfTarget(), k = T && host.brain.kfAtHead(T); if (!k) throw new Error("There is no keyframe at the playhead"); T.obj.uk.splice(T.obj.uk.indexOf(k), 1); if (!T.obj.uk.length) delete T.obj.uk; return kfRow(); },
    kfClear: () => { const T = host.brain.kfTarget(); if (T) delete T.obj.uk; return kfRow(); },
    kfStep: async (a) => {
      const T = host.brain.kfTarget(); if (!T || T.what !== "shot") return { ok: false, time: host.ES.pos };
      const local = host.ES.pos - T.a, frames = (T.obj.uk || []) as { t: number }[], next = Number(a.direction) < 0 ? [...frames].filter((f) => f.t < local - 0.02).pop() : frames.find((f) => f.t > local + 0.02);
      if (!next) return { ok: false, time: host.ES.pos };
      await host.brain.kfSeek(T.a + next.t); return { ok: true, time: host.ES.pos };
    },
    chat: async (a) => { const r = await host.brain.chatApp(String(a.text || "").slice(0, 300)); return { ...r, state: state() }; },
    set: (a) => {
      const box = String(a.box), v = a.value;
      if (box === "vfx") { host.ES.au = { ...host.ES.au, vfx: String(v) }; host.brain.applyVo(); }
      else if (box === "aitouch") { host.ES.au = { ...host.ES.au, ai: !!v }; host.brain.autoTools(); host.brain.applyVo(); host.ES.clipMixKey = ""; }
      else if (box === "look") host.ES.look = String(v);
      else if (box === "mode") { host.ES.mode = String(v); host.makeReel(); }
      else if (box === "seq") { host.ES.seqOn = v === "order"; host.makeReel(); }
      else if (box === "aspect") host.ES.aspect = String(v);
      else throw new Error(`The phone's own engine has no ${box}`);
      return { work: work(), state: state() };
    },
    /** a Talking Reel (the website's setKind('talk') and buildTalk): the clips' voice, pauses cut, the song quietly under
     * it; its captions as well when this person can have them. Throws when no one talks in the clips. */
    talk: async (a) => {
      const ES = host.ES;
      if (a.pace) ES.talkPace = String(a.pace);
      if (a.music !== undefined) ES.talkMusic = Number(a.music);
      io.task?.("start", "talk", "Cutting the pauses", "Finding where you speak", "voice");
      try {
        if (ES.kind !== "talk") await host.brain.setKind("talk"); else await host.brain.buildTalk();
        if (ES.nomake || !ES.edit.length) throw new Error(ES.nomake || "We could not hear anyone talking in these clips.");
        io.task?.("done", "talk", "Pauses cut");
      } catch (e) { io.task?.("fail", "talk", e instanceof Error ? e.message : "The talk could not be read"); throw e; }
      // its captions by themselves (the website's autoCaptions): most people watch with the sound off
      if (a.captions !== false && !ES.capsOn) await host.setCaptions(true, undefined, undefined).catch(() => { ES.capsOn = false; });
      const t = ES.talk as { parts: unknown[]; retakes: number; mute: number } | null;
      return { duration: ES.buf?.duration ?? 0, shots: ES.edit.length, parts: t?.parts.length ?? 0, retakes: t?.retakes ?? 0, mute: t?.mute ?? 0, captions: !!ES.capsOn };
    },
    /** a Talking Reel's sound (the voice and the song under it) as a WAV on the phone: the Reel's own sound in the editor */
    talkMix: async (a) => {
      const ES = host.ES; if (ES.kind !== "talk" || !ES.buf) return { path: null };
      const res = await io.fetch(url("out", `&name=${encodeURIComponent(String(a.name || "talk.wav"))}`), { method: "PUT", body: new Uint8Array(wavOf(ES.buf, 1)) });
      if (!res.ok) throw new Error("The Reel's sound could not be saved on the phone");
      return await res.json() as Args;
    },
    exportMix: async (a) => {
      host.exportChoose(a); if (a.fixLocked) host.exportFix();
      await host.brain.ensureMix();
      const s = host.brain.exportSound(), plan = host.exportPlan();
      // without the song: where to start it in Instagram so the cuts land on its beats (the website's noSongTip)
      const tip = host.ES.noSong ? String(host.brain.noSongTip()) : null;
      if (!s) return { path: null, plan, tip };
      const res = await io.fetch(url("out", `&name=${encodeURIComponent(String(a.name || "mix.wav"))}`), { method: "PUT", body: new Uint8Array(wavOf(s.buf, s.gain)) });
      if (!res.ok) throw new Error("The Reel's sound could not be saved on the phone");
      return { ...(await res.json() as Args), plan, tip };
    },
  };
  const NOT_YET: string[] = [];
  return {
    has: (op: string) => op in ops, notYet: NOT_YET, ascii, read: () => read, host: () => host,
    fresh: () => { stops++; read = []; copies = []; previews = new Map(); readBefore.clear(); signedIn = false; host = make(); },
    // Undo: the website keeps a step whenever the Reel stops changing (a ticker, every 500 ms); here there is no ticker,
    // so each tool's change is kept as its step around the call (Undo did nothing on the phone: no step was ever kept)
    call: async (op: string, a: Args = {}) => {
      const f = ops[op]; if (!f) throw new Error(`Not on the phone's own engine yet: ${op}`);
      const tick = () => { try { host.brain.histTick(); } catch { /* not ready: no Reel yet */ } };
      tick(); const out = await f(a); tick(); tick();
      return out;
    },
  };
}
