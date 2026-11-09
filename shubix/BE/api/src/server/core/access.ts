import type { ObjectId } from "mongodb";
import { ACCESS_PAGES, DEFAULT_ACCESS, STUDIO_ASK, type Access } from "@shubix/core/lib/access";
import { settings } from "./config";
import { db } from "./db";
import { ValidationFailed } from "./errors";

/** Sign-in rules (Administration → Settings → Sign-in rules), saved in app_settings; cached a few seconds. `googleReady`:
 * the server has a Google sign-in client (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET), so the button can show. */
const ID = "access" as unknown as ObjectId;
let cache: { at: number; value: Access } | null = null;

export const googleReady = () => !!(settings.googleClientId && settings.googleClientSecret);

export async function getAccess(): Promise<Access & { googleReady: boolean }> {
  if (!cache || Date.now() - cache.at > 5000) {
    const saved = ((await (await db()).collection("app_settings").findOne({ _id: ID })) ?? {}) as Partial<Access>;
    cache = { at: Date.now(), value: {
      open: Array.isArray(saved.open) ? saved.open.filter((p) => ACCESS_PAGES.some((x) => x.path === p)) : DEFAULT_ACCESS.open,
      studioAsk: STUDIO_ASK.some((x) => x.key === saved.studioAsk) ? saved.studioAsk! : DEFAULT_ACCESS.studioAsk,
      google: typeof saved.google === "boolean" ? saved.google : DEFAULT_ACCESS.google,
    } };
  }
  return { ...cache.value, googleReady: googleReady() };
}

export async function setAccess(patch: Partial<Access>) {
  if (patch.open && !patch.open.every((p) => ACCESS_PAGES.some((x) => x.path === p))) throw new ValidationFailed("Unknown page in the sign-in rules.", { code: "INVALID_ACCESS" });
  if (patch.studioAsk && !STUDIO_ASK.some((x) => x.key === patch.studioAsk)) throw new ValidationFailed("Unknown moment to ask for an account.", { code: "INVALID_ACCESS" });
  const clean = { ...(patch.open ? { open: [...new Set(patch.open)] } : {}), ...(patch.studioAsk ? { studioAsk: patch.studioAsk } : {}), ...(typeof patch.google === "boolean" ? { google: patch.google } : {}) };
  await (await db()).collection("app_settings").updateOne({ _id: ID }, { $set: { ...clean, updatedAt: new Date() } }, { upsert: true });
  cache = null;
  return getAccess();
}
