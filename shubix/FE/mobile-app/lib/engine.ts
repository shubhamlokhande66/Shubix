import { AppRegistry, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { askAction, tasks, tell, type TaskKind } from "@mobile/ui-mobile";
import { ShubixVideo } from "../modules/shubix-video";
import { clipDuration, type ChatLine, type ProjectClip, type ReelProject } from "@mobile/validations";
import { buildSpeedRampSegments, type ClipAdvice, type ExportVerdict, type MediaPick } from "@mobile/video-engine";
import { tokenStore } from "./device";
import { API_URL } from "./session";
import { fitShot } from "./shotFit";
import { fetch as nativeFetch } from "expo/fetch";
import { File } from "expo-file-system";
import { createNativeEngine } from "./nativeEngine";

/** The phone's own engine makes its Reels: the brain in the app's own JS (lib/nativeEngine.ts, engine/brain), with the
 * phone's code doing the heavy work through the app's little server (modules/shubix-video FileServer.kt). It does not
 * come from the website, so changing or deploying the website does not change the phone. It needs the app's own build (not Expo Go). */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
export type AiPlan = { story: string; lines: string[] };
export type SongAnalysis = { duration: number; bpm: number; beats: number; drops: number; breaks: number };
/** a shot of the Reel as the studio made it (its state(): the clip, where in it, the transition into it, its effect, its speed) */
export type EngineShot = { start: number; end: number; type: string; tr?: string; trRev?: boolean; efx?: string; sp: string; src: number; in: number; cs?: Record<string, unknown>; uk?: NonNullable<ProjectClip["keyframes"]> };
export type EngineReel = { work: { clips: number; shots: number }; state: { edit: EngineShot[]; mode?: string } & Record<string, unknown> };
/** the website's Export sheet: quality, frame rate, the watermark, without the song */
export type StudioExportPlan = { watermark: boolean; res: string; fps: number; bitrate: number; scale: number; stabs: ({ t: number[]; dx: number[]; dy: number[] } | null)[]; beats: number[][]; beatCam: unknown[]; follow: (number[][] | null)[] };
export type ExportChoice = { res?: "720" | "1080" | "4k"; fps?: 30 | 60; noWatermark?: boolean; noSong?: boolean; myReels?: boolean; fixLocked?: boolean };
export type ExportOptions = { res: Record<"720" | "1080" | "4k", { locked: boolean; off: boolean }>; fps60Locked: boolean; watermarkOff: boolean;
  size: string; fileName: string; myReels: boolean; myReelsNote: string; locked: { name: string; need: string }[] };

let held = "", clipRead: ((name: string, ok: boolean, best?: number | null) => void) | null = null;
/** told as each clip is read: its card shows it */
export const onClipRead = (fn: typeof clipRead) => { clipRead = fn; };
/** The person's work goes on while they are away (the screen off, another app): a notification says so, the screen stays on
 * while they watch. Counted: it ends when the last job has ended. The JS task only keeps the app's timers running. */
let working = 0, endTask: (() => void) | null = null;
if (Platform.OS === "android") AppRegistry.registerHeadlessTask("ShubixWork", () => () => new Promise<void>((done) => { endTask = done; }));
export const keepAwake = (on: boolean, title = "Shubix is working on your Reel") => {
  working = Math.max(0, working + (on ? 1 : -1));
  if (on ? working !== 1 : working !== 0) return;
  try { ShubixVideo?.keepAwake?.(on, title); } catch { /* an older build: nothing */ }
  if (!on) { endTask?.(); endTask = null; }
};
const files = ShubixVideo ? ShubixVideo.fileServer(API_URL) : null;

/** whether this phone can make Reels with the studio (the app's own build, not Expo Go or the web) */
export const engineOn = Platform.OS !== "web" && !!files;

/** Ask Shubix's change in the editor: its progress line goes to the chat panel (onChatStat) while it works */
let chatting = false;
const chatSays = new Set<(text: string) => void>();
export function onChatStat(f: (text: string) => void) { chatSays.add(f); return () => { chatSays.delete(f); }; }

const native = files ? createNativeEngine({
  base: `http://127.0.0.1:${files.port}`, key: files.key, fetch: nativeFetch as never, token: () => tokenStore.get(),
  ask: async (q) => { const v = await askAction({ title: q.title, body: [q.text, q.bal == null ? "" : `You have ${q.bal} credits`].filter(Boolean).join(" · "), list: q.list, ok: q.ok, ...(q.no ? { cancel: q.no } : {}) }); return v === 0 ? true : v === 1 && q.no ? false : null; },
  // (during an Ask Shubix change the editor stays usable: its line goes to the chat panel, not a full-screen popup)
  stat: (text, err) => { if (chatting) { chatSays.forEach((f) => f(text && !err ? text.replace(/…$/, "") : "")); return; } if (!text) return tasks.clear("ai"); if (text.endsWith("…")) { tasks.start("ai", "ai", "Shubix at work", text.slice(0, -1)); return; } if (err) tasks.fail("ai", text); else tasks.done("ai", text); },
  spent: () => tasks.lock(),
  clipDone: (name, ok, best) => clipRead?.(name, ok, best),
  readBytes: async (path, at, length) => { const h = new File(`file://${path}`).open(); try { h.offset = at; return h.readBytes(length); } finally { h.close(); } },
  tell: (text) => tell(text, "danger"),
  task: (state, id, title, detail, kind, p) => onTask({ event: "task", id, state, p: p ?? null, title, detail, kind: kind as TaskKind | undefined }),
}) : null;

/** My brand: the @handle and the logo (a file kept on the phone), on every Reel made here: the logo small in a corner and
 * an end card (the brain's brandFinish, as the website's). Kept in the app's storage; the engine gets it at start. */
const BRAND_KEY = "shubix.brand";
export type MyBrand = { handle: string; logoPath: string | null; logoW?: number; logoH?: number; mark: boolean; end: boolean };
export async function brandGet(): Promise<MyBrand | null> { try { return JSON.parse((await AsyncStorage.getItem(BRAND_KEY)) || "null") as MyBrand | null; } catch { return null; } }
export async function brandSave(b: MyBrand | null) {
  const keep = b && (b.handle.trim() || b.logoPath) ? b : null;
  if (keep) await AsyncStorage.setItem(BRAND_KEY, JSON.stringify(keep)); else await AsyncStorage.removeItem(BRAND_KEY);
  if (native) await native.call("brandSet", (keep ?? {}) as Record<string, unknown>);
  return keep;
}
if (native) void brandGet().then((b) => (b ? native.call("brandSet", b as unknown as Record<string, unknown>) : null)).catch(() => {});

async function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!native) throw new Error("Making Reels needs the Shubix app (not Expo Go).");
  // whatever takes more than a moment (Ask Shubix, captions, Remix, a tool) goes on in another app and with the screen off
  let held = false;
  const t = setTimeout(() => { held = true; keepAwake(true); }, 400);
  try { return await (native.call(op, args) as Promise<T>); } finally { clearTimeout(t); if (held) keepAwake(false); }
}
/** the studio's texts as the phone keeps them (its own: a number id, t0 / t1, size as a multiple of 36); every setting kept */
export function textsOf(list: unknown): ReelProject["overlays"] | undefined {
  if (!Array.isArray(list)) return undefined;
  return (list as Record<string, unknown>[]).filter((o) => typeof o.text === "string" && o.kind !== "squareFrame").map((o) => {
    const start = Math.max(0, Number(o.start ?? o.t0) || 0), size = Number(o.size) || 1;
    const { box: _b, t0: _a, t1: _z, all: _l, ...rest } = o;
    return { ...rest, id: String(o.id), text: String(o.text).slice(0, 300), start, end: Math.max(start + 0.05, Number(o.end ?? o.t1) || start + 3), color: String(o.color || "#FFFFFF"),
      size: Math.max(8, Math.min(120, size > 4 ? size : Math.round(size * 36))) } as ReelProject["overlays"][number];
  });
}
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

export const engine = {
  /** the song: the website analyses it (beats, drops, breaks) and checks its beats */
  song: (uri: string, name: string) => call<SongAnalysis>("song", { path: pathOf(uri), name }),
  /** Copy a Reel: the Reel to match is read (its cuts, transitions, moves and look: video-engine refReader.ts, as the website) */
  ref: (uri: string, name: string) => call<{ cuts: number; shots: number; bpm: number; trans: Record<string, number> }>("ref", { path: pathOf(uri), name }),
  /** the Reel's choices, as the website's buttons: length (0 = the whole song), clip order, format, style */
  choose: (c: { length?: number; order?: "mix" | "order"; text?: "auto" | "none"; aspect?: string; mode?: "auto" | "smooth" | "fast"; template?: string }) => call<{ start: number }>("choose", c),
  /** the song's part moved on the waves: the Reel uses the song from `start` */
  part: (start: number) => call<{ start: number }>("part", { start }),
  /** how many clips this song's part asks for: videos, photos, or either under Mix (video-engine clipAdvice.ts); null: no song yet */
  advice: (pick: MediaPick) => call<ClipAdvice | null>("advice", { pick }),
  /** the clips: the website reads them (motion, scenes, faces) and makes the Reel on the beats */
  clips: (list: { uri: string; name: string }[]) => call<{ clips: number; names: string[] }>("clips", { paths: list.map((c) => ({ path: pathOf(c.uri), name: c.name })) }),
  /** a Talking Reel, as the website makes it: the clips' voice with its pauses cut, the song quietly under it, captions */
  talk: (o: { pace?: "tight" | "natural" | "relaxed" | "off"; music?: number; captions?: boolean } = {}) =>
    call<{ duration: number; shots: number; parts: number; retakes: number; mute: number; captions: boolean }>("talk", o),
  /** a Talking Reel's sound (its voice and the song under it) as a WAV file on the phone; null: not a Talking Reel */
  talkMix: (name: string) => call<{ path: string | null }>("talkMix", { name }).then((r) => r.path),
  /** once the Reel is made: its shots (`id`: the phone's draft, which the studio now holds) */
  ready: (id: string) => call<EngineReel>("ready").then((r) => { held = id; return r; }),
  /** whether the studio holds this draft as it made it (then the website's export makes it, with its transitions and effects) */
  holds: (id: string) => engineOn && held === id,
  /** the Reel as the phone's editor changed it, back in the studio (its order, trims, speeds, transitions, effects), so
   * the website's export still makes it; false when the studio cannot make it so (a new clip, a turned or mirrored clip,
   * a filter: then the phone's export makes it) */
  edit: async (p: ReelProject) => {
    if (!engine.holds(p.id)) return false;
    const list = [];
    let t = 0;
    for (const c of p.clips) {
      const from = made.get(c.id) ?? [...made.values()].find((candidate) => candidate.clip.uri === c.uri && candidate.clip.kind === c.kind);
      if (!from || KEEP.some((k) => c[k] !== from.clip[k])) return false;
      const len = clipDuration(c);
      const hasRamp = !!c.speedRamp?.length;
      const sp = hasRamp ? "curve" : (from.clip.speed === c.speed ? from.shot.sp : Object.keys(SPEED).find((k) => SPEED[k] === c.speed));
      if (!sp) return false; // a fixed speed the studio has not (it has slow, normal, fast)
      const base = from.shot;
      const cs = { ...(base.cs ?? {}) };
      if (hasRamp) {
        const segments = buildSpeedRampSegments(c.speedRamp!, c.end - c.start, { fallbackSpeed: c.speed, maxSegmentDuration: 0.2 });
        const sample = (timelineTime: number) => {
          const segment = segments.find((item) => timelineTime <= item.outputEnd + 0.0001) ?? segments[segments.length - 1];
          return segment?.speed ?? c.speed;
        };
        cs.curve = { a: sample(0), b: sample(len * 0.25), c: sample(len * 0.5), d: sample(len * 0.75), e: sample(len) };
      }
      if (c.reverse !== from.clip.reverse) cs.rev = c.reverse;
      if (c.rotation !== from.clip.rotation) cs.rot = c.rotation;
      if (c.mirror !== from.clip.mirror) cs.fh = c.mirror;
      if (c.flip !== from.clip.flip) cs.fv = c.flip;
      if (c.fit !== from.clip.fit) cs.fit = c.fit === "contain";
      if (c.muted !== from.clip.muted || c.volume !== from.clip.volume) cs.vol = c.muted ? 0 : c.volume;
      list.push({ ...from.shot, ...(Object.keys(cs).length ? { cs } : {}), start: t, end: t + len, in: c.start, sp, tr: c.transition === "hard" ? undefined : c.transition, efx: c.effect, uk: c.keyframes ?? from.shot.uk });
      t += len;
    }
    return (await call<{ ok: boolean }>("edit", { shots: list, overlays: p.overlays })).ok;
  },
  /** Studio history (including advanced tools) mapped back into the phone's clip model. */
  undo: async () => {
    if (!held) return { ok: false as const };
    const result = await call<{ ok: boolean; state?: { edit?: EngineShot[]; overlays?: ReelProject["overlays"] } }>("undo");
    if (!result.ok || !Array.isArray(result.state?.edit)) return { ok: false as const };
    return { ok: true as const, clips: shotsOf(result.state.edit, sources), overlays: textsOf(result.state.overlays) };
  },
  redo: async () => {
    if (!held) return { ok: false as const };
    const result = await call<{ ok: boolean; state?: { edit?: EngineShot[]; overlays?: ReelProject["overlays"] } }>("redo");
    if (!result.ok || !Array.isArray(result.state?.edit)) return { ok: false as const };
    return { ok: true as const, clips: shotsOf(result.state.edit, sources), overlays: textsOf(result.state.overlays) };
  },
  /** Ask Studio for another locally generated edit, then map its shots back to the native clip model. */
  remix: async () => {
    if (!held) return { ok: false as const };
    const result = await call<{ ok: boolean; state?: { edit?: EngineShot[]; overlays?: ReelProject["overlays"] } }>("remix");
    if (!result.ok || !Array.isArray(result.state?.edit)) return { ok: false as const };
    return { ok: true as const, clips: shotsOf(result.state.edit, sources), overlays: textsOf(result.state.overlays) };
  },
  /** a choice in one of the editor's tools, made in the studio as on the website (its button `attr`=`value` in `box`,
   * or its input `box` set to `value`), the editor's changes sent first: the Reel's clips after it; null when the studio
   * does not hold this Reel as it is (then the phone does what it can) */
  tool: (op: string, args: Record<string, unknown> = {}) => call<Record<string, unknown>>(op, args),
  /** the creator's own beat markers (add at `time`, del the one there, clear): the Reel's clips after the edit is made again */
  mark: async (p: ReelProject, op: "add" | "del" | "clear", time: number) => {
    if (!(await engine.edit(p))) return null;
    const r = await call<{ ok: boolean; state?: { edit?: EngineShot[] } }>("mark", { op, time });
    return r.ok && Array.isArray(r.state?.edit) ? shotsOf(r.state!.edit!, sources) : null;
  },
  addLayer: (uri: string, name: string) => call<Record<string, unknown>>("layerAdd", { path: pathOf(uri), name }),
  set: async (p: ReelProject, box: string, value: string | boolean, attr?: string) => {
    if (!(await engine.edit(p))) return null;
    return shotsOf((await call<EngineReel>("set", { box, value, ...(attr ? { attr } : {}) })).state.edit, sources);
  },
  /** for the native export: the Reel's whole sound as a WAV on the phone (null: no sound), and what the studio decided from the plan and these choices */
  exportMix: (name: string, o: ExportChoice = {}) => call<{ path: string | null; plan: StudioExportPlan }>("exportMix", { name, ...o }),
  /** the finished video read back and checked against the edit: retake says making it again should fix it */
  checkExport: (uri: string) => call<{ verdict: ExportVerdict | null }>("checkExport", { path: pathOf(uri) }),
  /** a finished Reel saved to My Reels too */
  saveToMyReels: (uri: string, name: string) => call("saveToMyReels", { path: pathOf(uri), name }),
  /** the website's Export sheet with these choices: what the plan and the phone allow, the size, the file name, My Reels */
  exportOptions: (o: ExportChoice = {}) => call<ExportOptions>("exportOptions", o),
  /** the Reel's picture at `t` exactly as the studio makes it (null: it could not) */
  frame: (t: number) => call<{ src: string }>("frame", { t }).then((r) => r.src || null).catch(() => null),
  /** Proceed after a Cancel: the song goes on from where it stopped */
  songAgain: () => call<SongAnalysis>("songAgain"),
  /** The popup's Cancel: the studio stops what is running; what is done stays done */
  cancel: () => call<{ ok: boolean }>("cancel"),
  /** Next after the clips: Shubix AI's question, then its work; false when the person closed the question or cancelled */
  ai: () => call<{ went: boolean }>("ai").then((r) => r.went),
  /** Make new Reel: charged as a new Reel; Keep old Reel: the studio holds that Reel again */
  newReel: () => call<{ ok: boolean }>("newReel"),
  keptOldReel: () => call<{ ok: boolean }>("keptOldReel"),
  /** the good footage in the clips read (whole seconds; `exact`: not rounded), the Reel's length, and the song's beat (seconds apart, 0: none) */
  footage: () => call<{ have: number; need: number; exact?: number; period?: number; clips?: number }>("footage"),
  /** Shubix AI's price for this Reel and the balance */
  aiPrice: () => call<{ on: boolean; cost: number; balance: number | null; paid: boolean }>("aiPrice"),
  /** whether this person's plan has Shubix AI */
  aiOn: () => call<{ on: boolean }>("aiState").then((r) => r.on),
  /** a new Reel: nothing of the Reel before it stays (song, clips, edit, AI, cards) */
  fresh: () => restart(),
  /** what Shubix AI planned for the Reel the studio holds: its story and a line per shot; null when it did not edit it */
  aiPlan: () => call<AiPlan | null>("aiPlan"),
  /** what Shubix AI did to the Reel the studio holds (looked at the clips, the pace, the plan, could not), with its time */
  history: () => call<ChatLine[]>("history"),
  /** everything the studio is doing stops (the person left the screen that asked for it) */
  stop: () => restart(),
  /** the clips' smooth copies the studio made (4K / HDR / 60 fps / a changing frame rate), saved on the phone: the
   * phone's preview and export play these, so heavy footage never stutters or stalls (`name`: the clip as sent) */
  copies: () => call<{ name: string; path: string; w: number; h: number; photo?: number }[]>("copies").catch(() => []),
  /** Ask Shubix from the editor: the website's own AI chat on the Reel the studio holds; its plan is applied there and
   * the Reel's clips come back (null: the studio does not hold this Reel) */
  chat: async (p: ReelProject, text: string) => {
    if (!engine.holds(p.id)) return null;
    // the studio's copy could not be brought to this Reel (a change it cannot hold): its answer would put older shots
    // back over the ones on the phone, so the phone's own changes answer instead
    if (!(await engine.edit(p).catch(() => false))) return null;
    chatting = true;
    const r = await call<{ answer: string; applied: boolean; state?: { edit?: EngineShot[]; overlays?: ReelProject["overlays"] } }>("chat", { text }).finally(() => { chatting = false; chatSays.forEach((f) => f("")); });
    return { answer: r.answer, clips: r.applied && Array.isArray(r.state?.edit) ? shotsOf(r.state!.edit!, sources) : null, overlays: textsOf(r.state?.overlays) };
  },
};

// the studio's speeds as the phone plays them (ramps, freezes and curves play at 1× here; the studio's export keeps them)
const SPEED: Record<string, number> = { normal: 1, slow: 0.5, fast: 1.6 };
// each clip the studio made: its shot (engine.edit sends it back changed) and the clip as made (what the studio cannot change)
const made = new Map<string, { shot: EngineShot; clip: ProjectClip }>();
let sources: ProjectClip[] = [];
const KEEP = ["uri", "filter"] as const;
/** The Reel's shots as the phone editor's clips: each shot its part of its clip (from `in`, as long as the shot at its
 * speed), the transition into it and its effect. `list`: the clips the studio kept, in its order (its `src`). */
export function shotsOf(shots: EngineShot[], list: ProjectClip[]): ProjectClip[] {
  made.clear(); sources = list;
  return shots.map((e, i) => {
    const c = list[e.src] ?? list[0], timeline = e.end - e.start;
    const { start, end, speed } = c.kind === "image" ? { start: 0, end: timeline, speed: 1 } : fitShot(timeline, SPEED[e.sp] ?? 1, c.sourceDuration, e.in);
    // the shot's own sound, as the website (csVoiced): it plays only when the studio gave it a volume (talk, a kept
    // moment, a volume keyframe); otherwise the song alone (the clip kept its full sound under the song before)
    const cs = (e.cs ?? {}) as { vol?: number; kx?: { vol?: number }[] }, vol = Number(cs.vol) || 0;
    const voiced = vol > 0 || (Array.isArray(cs.kx) && cs.kx.some((k) => Number(k?.vol) > 0));
    const sound = c.kind === "image" ? {} : { muted: !voiced, volume: voiced ? Math.min(1, vol || 1) : 1 };
    const clip = { ...c, id: `${c.id}-s${i}`, start, end, duration: end - start, speed, transition: e.tr || "hard", ...(e.tr === "whip" && e.trRev ? { trRev: true } : {}), effect: e.efx || undefined, keyframes: e.uk, ...sound, ...(e.cs ? { cs: e.cs } : {}) };
    made.set(clip.id, { shot: e, clip });
    return clip;
  });
}

// the studio's task cards ("studio-task") on the phone's
type TaskEvent = { event: "task"; id: string; kind?: TaskKind; state: "start" | "progress" | "done" | "fail" | "clear"; p: number | null; title?: string; detail?: string };
const shown = new Set<string>(); // the studio's cards on screen now (cleared when it starts again)
function onTask(t: TaskEvent) {
  if (t.state === "start" || t.state === "progress") shown.add(t.id); else shown.delete(t.id);
  if (t.state === "start") tasks.start(t.id, t.kind ?? "ai", t.title ?? "", t.detail ?? "");
  else if (t.state === "progress") tasks.update(t.id, t.p, t.detail, t.title);
  else if (t.state === "done") tasks.done(t.id, t.title);
  else if (t.state === "fail") tasks.fail(t.id, t.title ?? "");
  else tasks.clear(t.id);
}
// everything starts again: what it was doing stops, no card stays
function restart() {
  native?.fresh(); held = ""; shown.forEach((id) => tasks.clear(id)); shown.clear(); tasks.unlock();
}
