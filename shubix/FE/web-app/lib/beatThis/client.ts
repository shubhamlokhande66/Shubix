import type { BeatThisResult } from "@shubix/core/lib/beatThis/core";
import { FILTERBANK_PATH, MODEL_PATH, resample, simdOk } from "@shubix/core/lib/beatThis/device";
import { isIOS } from "../ortThreads";

/** Fast Studio's on-device beat tracker: Beat This! in a worker (lib/beatThis/beatThis.worker.ts). The song is resampled
 * to 22 050 Hz here (the browser's own resampler), the network runs in the worker. Rejects when this device cannot run
 * it (no WebAssembly SIMD, too little memory, the model cannot be downloaded); the editor then keeps its own tracker. */

export const MODEL_URL = MODEL_PATH;
export const FILTERBANK_URL = FILTERBANK_PATH;
export const WASM_BASE = "/vendor/ort/";

export type Progress = (stage: "download" | "run", p: number) => void;
export type OnDeviceBeats = BeatThisResult & { ms: { resample: number; load: number; run: number } };

// waiting: the requests the current worker still owes an answer (a new song can be picked while one is checked)
let worker: Worker | null = null, nextId = 1, waiting = 0;

export function canRunOnDevice(): boolean {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined" || !simdOk()) return false;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return !(mem !== undefined && mem < 2);   // under 2 GB: the 23 MB model plus the song would crowd the tab
}

// one song at a time: two checks at once on the one worker (a song checked again while its first check ran) never
// answered, and Make Reel waited for them for ever (2026-11-11)
let queue: Promise<unknown> = Promise.resolve();
// a worker that says nothing for this long is stuck: let go, the editor keeps its own beats. Loading the model and a short
// song's one part are silent and slow on one thread (48 s for 10 s of song on a 4-core laptop while the clips were read,
// 2026-11-11), so the limit is well above that; Make Reel waits for the check, never for ever.
const SILENT_MS = 90_000;

export function beatThisOnDevice(mono: Float32Array, sr: number, onProgress?: Progress): Promise<OnDeviceBeats> {
  const run = queue.then(() => checkOnce(mono, sr, onProgress));
  queue = run.catch(() => undefined);
  return run;
}

async function checkOnce(mono: Float32Array, sr: number, onProgress?: Progress): Promise<OnDeviceBeats> {
  if (!canRunOnDevice()) throw new Error("this device cannot run the AI beat tracker");
  const t0 = performance.now();
  const samples = await resample(mono, sr);
  const tr = Math.round(performance.now() - t0);
  worker ??= new Worker(new URL("./beatThis.worker.ts", import.meta.url), { type: "module" });
  const w = worker, id = nextId++;
  waiting++;
  // an iPhone: the worker goes once nothing more is asked of it. Its WebAssembly memory (the model, a few hundred MB)
  // never shrinks, and the clips and the Reel need it next; the model stays in Cache Storage, so the next song loads
  // fast. Not while another request waits on it (a second song picked meanwhile): that one would never be answered.
  const settle = () => { waiting = Math.max(0, waiting - 1); if (isIOS() && waiting === 0 && worker === w) { w.terminate(); worker = null; } };
  return new Promise((resolve, reject) => {
    let silent: ReturnType<typeof setTimeout> | undefined;
    const end = () => { clearTimeout(silent); w.removeEventListener("message", onMsg); w.removeEventListener("error", onErr); };
    const watch = () => { clearTimeout(silent); silent = setTimeout(() => { end(); w.terminate(); if (worker === w) worker = null; waiting = 0; reject(new Error("the beat tracker stopped answering")); }, SILENT_MS); };
    const onMsg = (e: MessageEvent) => {
      const d = e.data; if (d.id !== id) return;
      if (d.type === "progress") { watch(); onProgress?.(d.stage, d.p); return; }
      end();
      settle();
      if (d.type === "done") resolve({ ...d.result, ms: { resample: tr, ...d.ms } });
      else reject(new Error(d.message));
    };
    const onErr = (e: ErrorEvent) => { end(); if (worker === w) worker = null; settle(); reject(new Error(e.message || "beat worker failed")); };
    w.addEventListener("message", onMsg); w.addEventListener("error", onErr);
    watch();
    w.postMessage({ id, samples, model: new URL(MODEL_URL, location.href).href, filterbank: new URL(FILTERBANK_URL, location.href).href, wasm: new URL(WASM_BASE, location.href).href }, [samples.buffer]);
  });
}
