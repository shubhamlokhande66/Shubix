import { Platform } from "react-native";
import Constants from "expo-constants";
import { createApiClient } from "@mobile/api-client";
import { tokenStore } from "./device";
import { askAction, claimPressed } from "@mobile/ui-mobile";

/** BE/api (NestJS): every endpoint. EXPO_PUBLIC_API_URL, else the computer running Expo: in a browser localhost; on a
 * phone (Expo Go) or an emulator the address Expo itself was opened from (the computer's LAN address), port 4000. */
const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === "web" ? "http://localhost:4000" : `http://${devHost || "10.0.2.2"}:4000`)).replace(/\/$/, "");

/** The one API client of the phone app: the token kept on the device (device.ts), sent as Bearer (the website uses
 * the cookie). */
// Shubix's server could not be reached or failed: a popup in plain words with Retry and Close, the person stays on the
// screen; calls failing together share one popup. A "no" from the server (wrong password, no credits) is not this.
let asking: Promise<boolean> | null = null;
const onServerTrouble = () => (asking ??= askAction({ title: "Shubix is not answering right now", body: "Our team is working on it. Check your internet, then press Retry. Nothing you made here is lost.", ok: "Retry", cancel: "Close" })
  .then((v) => v === 0).finally(() => { asking = null; }));
export const api = createApiClient({ baseUrl: API_URL, mobile: true, getToken: tokenStore.get, setToken: tokenStore.set, onServerTrouble, onStart: claimPressed });
