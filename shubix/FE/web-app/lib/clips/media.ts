/** Clips from a long video, on the phone: the video's voice read part by part (for the words), the chosen moment cut out
 * as its own MP4, and the cut clip handed to the Talking Reel studio. The video itself is never uploaded. */

export const PART_SECONDS = 170; // under the transcriber's 180 s, with room for its WAV header

type Mb = typeof import("mediabunny");
const mb = (): Promise<Mb> => import("mediabunny");

/** The video's length in seconds, and whether it has a sound track at all. */
export async function probe(file: File): Promise<{ duration: number; audio: boolean }> {
  const m = await mb();
  const input = new m.Input({ source: new m.BlobSource(file), formats: m.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    return { duration: await input.computeDuration(), audio: !!track };
  } finally { input.dispose?.(); }
}

/** 16 kHz mono 16-bit WAV, loudest point at 90%. */
export function wav16(y: Float32Array): ArrayBuffer {
  let pk = 0; for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > pk) pk = Math.abs(y[i]);
  const gain = pk > 0 ? 0.9 / pk : 1, dv = new DataView(new ArrayBuffer(44 + y.length * 2));
  const str = (o: number, x: string) => { for (let i = 0; i < x.length; i++) dv.setUint8(o + i, x.charCodeAt(i)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + y.length * 2, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, y.length * 2, true);
  for (let i = 0; i < y.length; i++) dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(y[i] * gain * 32767))), true);
  return dv.buffer;
}

/** The voice of the video in parts of PART_SECONDS, each as a 16 kHz WAV with where it starts. Only one part is in memory
 * at a time, so an hour-long video works on a phone. */
export async function* voiceParts(file: File, signal?: AbortSignal): AsyncGenerator<{ from: number; to: number; duration: number; wav: ArrayBuffer }> {
  const m = await mb();
  const input = new m.Input({ source: new m.BlobSource(file), formats: m.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("This video has no sound, so there are no words to find clips in.");
    const duration = await input.computeDuration(), sink = new m.AudioSampleSink(track);
    for (let a = 0; a < duration; a += PART_SECONDS) {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      const b = Math.min(duration, a + PART_SECONDS);
      let sr = 0, buf: Float32Array | null = null;
      for await (const s of sink.samples(a, b)) {
        try {
          if (!buf) { sr = s.sampleRate; buf = new Float32Array(Math.ceil((b - a) * sr) + 1); }
          const n = s.numberOfFrames, ch = s.numberOfChannels, at = Math.round((s.timestamp - a) * sr);
          const tmp = new Float32Array(n);
          for (let c = 0; c < ch; c++) {
            s.copyTo(tmp, { planeIndex: c, format: "f32-planar" });
            for (let i = 0; i < n; i++) { const k = at + i; if (k >= 0 && k < buf.length) buf[k] += tmp[i] / ch; }
          }
        } finally { s.close(); }
      }
      if (!buf || b - a < 0.5) continue;
      // to 16 kHz (the browser's own resampler)
      const oc = new OfflineAudioContext(1, Math.max(1, Math.ceil((b - a) * 16000)), 16000);
      const ab = oc.createBuffer(1, buf.length, sr); ab.copyToChannel(buf as Float32Array<ArrayBuffer>, 0);
      const src = oc.createBufferSource(); src.buffer = ab; src.connect(oc.destination); src.start();
      const y = (await oc.startRendering()).getChannelData(0);
      yield { from: a, to: b, duration, wav: wav16(y) };
    }
  } finally { input.dispose?.(); }
}

/** The moment [start, end] cut out as its own MP4 (exact frames: re-encoded only where it has to be). */
export async function cutClip(file: File, start: number, end: number, onProgress?: (p: number) => void): Promise<File> {
  const m = await mb();
  const input = new m.Input({ source: new m.BlobSource(file), formats: m.ALL_FORMATS });
  try {
    const output = new m.Output({ format: new m.Mp4OutputFormat({ fastStart: "in-memory" }), target: new m.BufferTarget() });
    const conv = await m.Conversion.init({ input, output, trim: { start, end } });
    if (!conv.isValid) throw new Error("This video cannot be cut in this browser. Try Chrome or Edge.");
    if (onProgress) conv.onProgress = (p) => onProgress(p);
    await conv.execute();
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([output.target.buffer!], `${base} ${fmt(start).replace(":", "m")}s.mp4`, { type: "video/mp4", lastModified: Date.now() });
  } finally { input.dispose?.(); }
}

export const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// ------------------------------------------------------------------ the cut clip, handed to the Talking Reel studio
// (the studio opens with a full page load, so the clip waits in this browser's IndexedDB, not in memory)
const DB = "shubix-clips", STORE = "pending", KEY = "clip";
function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
export async function keepForStudio(f: File): Promise<void> {
  const db = await open();
  await new Promise<void>((ok, no) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put({ f, at: Date.now() }, KEY); t.oncomplete = () => ok(); t.onerror = () => no(t.error); });
  db.close();
}
/** The clip waiting for the studio (once: it is removed), if it was kept in the last 10 minutes. */
export async function takeForStudio(): Promise<File | null> {
  try {
    const db = await open();
    const got = await new Promise<{ f: File; at: number } | undefined>((ok, no) => {
      const t = db.transaction(STORE, "readwrite"), s = t.objectStore(STORE), r = s.get(KEY);
      r.onsuccess = () => { s.delete(KEY); ok(r.result as { f: File; at: number } | undefined); }; r.onerror = () => no(r.error);
    });
    db.close();
    return got && Date.now() - got.at < 10 * 60_000 ? got.f : null;
  } catch { return null; }
}
