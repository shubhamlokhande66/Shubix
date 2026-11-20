import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ShubixVideo } from "../modules/shubix-video";
import { API_URL } from "./session";

const send = (body: { kind: string; message: string; stack: string; path: string }) =>
  fetch(`${API_URL}/api/public/client-error`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

/** The times Android closed the app (out of memory, a native crash, not answering): the app was gone before it could say
 * so, so it says it at the next start, once each (the last one told is kept on the phone). */
async function reportLastExits() {
  if (Platform.OS !== "android" || !ShubixVideo?.lastExits) return;
  const KEY = "shubix-exits-told", since = Number(await AsyncStorage.getItem(KEY).catch(() => null)) || 0;
  let exits: { at: number; reason: string; description: string; pss: number; rss: number; trace: string }[] = [];
  try { exits = JSON.parse(ShubixVideo.lastExits(since)); } catch { return; }
  if (!exits.length) return;
  await AsyncStorage.setItem(KEY, String(Math.max(...exits.map((x) => x.at)))).catch(() => {});
  const c = Platform.constants as { Model?: string; Release?: string };
  for (const x of exits.slice(0, 5)) void send({ kind: "crash", path: "app/android",
    message: `Android closed the app: ${x.reason}${x.description ? ` · ${x.description}` : ""}`.slice(0, 400),
    stack: `${c.Model ?? "Android"} ${c.Release ?? ""} · memory ${Math.round(x.rss / 1024)} MB · ${new Date(x.at).toISOString()}${x.trace ? `
${x.trace}` : ""}`.slice(0, 2000) });
}

type Handler = (error: Error, fatal?: boolean) => void;
type Utils = { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void };

/** Errors in the store app reach Admin → Errors, as the website's do (lib/useErrorReport.ts): nothing personal, at most
 * ten in a run, and the app's own handling goes on as before. */
export function reportErrors() {
  const utils = (globalThis as unknown as { ErrorUtils?: Utils }).ErrorUtils;
  if (__DEV__ || !utils) return;
  void reportLastExits();
  const before = utils.getGlobalHandler();
  let sent = 0;
  utils.setGlobalHandler((error, fatal) => {
    if (sent++ < 10) void fetch(`${API_URL}/api/public/client-error`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: fatal ? "crash" : "error", message: String(error?.message || error).slice(0, 400), stack: String(error?.stack || "").slice(0, 2000), path: `app/${Platform.OS}` }),
    }).catch(() => {});
    before(error, fatal);
  });
}

const told = new Set<string>();
/** Something that is no crash but should be seen in Admin → Errors (why no ad loads): once per kind in a run. */
export function reportProblem(message: string) {
  if (__DEV__ || told.has(message) || told.size >= 10) return;
  told.add(message);
  void fetch(`${API_URL}/api/public/client-error`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "error", message: message.slice(0, 400), stack: "", path: `app-${Platform.OS}` }),
  }).catch(() => {});
}
