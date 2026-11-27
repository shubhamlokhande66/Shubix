import { describe, expect, it } from "vitest";
import { createNativeEngine } from "../lib/nativeEngine";

// A Talking Reel made by the app's own engine as the website makes it (engine/brain/talk.ts, 2026-11-27): the clip's
// voice with its pauses cut, one shot per spoken part, the voice as the Reel's sound, no zoom, and a video wider than
// the Reel fitted whole. The phone's speech model is not here, so speech is found by loudness (as the website does
// when its model cannot run).
const SR = 16000;
/** a talk: `on` seconds of voice, then `off` seconds of near silence, `n` times */
function talkSound(n: number, on: number, off: number) {
  const x = new Float32Array(Math.round(n * (on + off) * SR));
  let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646 - 0.5; };
  for (let k = 0; k < n; k++) {
    const a = Math.round(k * (on + off) * SR);
    for (let i = 0; i < x.length - a; i++) x[a + i] = i < on * SR ? 0.3 * Math.sin(i * 0.07) * (0.6 + rnd()) : 0.002 * rnd();
  }
  return x;
}
function phone(sound: Float32Array, w: number, h: number) {
  const dur = sound.length / SR;
  const samples = Array.from({ length: Math.floor(dur * 10) }, (_, i) => ({ t: i / 10, m: 0.01, b: 0.5, cx: 0.5, sh: 100, sx: 0.5, sy: 0.5, sw: 0 }));
  const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => String(body), json: async () => body, arrayBuffer: async () => body as ArrayBuffer });
  const fetcher = async (url: string) => {
    const path = new URL(url).pathname.slice(1);
    if (path === "sound") { const out = new ArrayBuffer(8 + sound.byteLength), v = new DataView(out); v.setInt32(0, SR, true); v.setInt32(4, 1, true); new Float32Array(out, 8).set(sound); return ok(out); }
    if (path === "probe") return ok({ dur, w, h });
    if (path === "scan") return ok(`0.5\n${JSON.stringify({ samples, scenes: [] })}\n`);
    if (path === "faces") return ok("[]\n");
    return { ok: false, status: 404, text: async () => "no", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return createNativeEngine({ base: "http://phone", key: "k", apiWait: 0, fetch: fetcher as never });
}
type Shot = { start: number; end: number; in: number; efx: string; cs?: { fit?: boolean; bg?: string }; sp: { label: string } };
const stateOf = (e: ReturnType<typeof createNativeEngine>) => (e.host() as unknown as { ES: { edit: Shot[]; buf: { duration: number }; kind: string } }).ES;

describe("a Talking Reel on the phone", () => {
  it("cuts the pauses, one shot per spoken part, the voice as the Reel's sound", async () => {
    const e = phone(talkSound(4, 2, 1.5), 1080, 1920);
    await e.call("clips", { paths: [{ path: "/talk.mp4", name: "talk.mp4" }] });
    const r = await e.call("talk", { pace: "natural", captions: false }) as { duration: number; shots: number; parts: number };
    const ES = stateOf(e);
    expect(ES.kind).toBe("talk");
    expect(r.parts).toBe(4);
    expect(ES.edit.length).toBe(4);
    // 4 x 2 s of voice with a little room each side, the 1.5 s pauses gone (14 s of clip)
    expect(r.duration).toBeGreaterThan(8);
    expect(r.duration).toBeLessThan(10);
    expect(ES.buf.duration).toBeCloseTo(r.duration, 2);
    // each shot starts where its sentence does, in order, at normal speed, with no zoom
    ES.edit.forEach((s, i) => { expect(s.in).toBeGreaterThan(i * 3.5 - 0.3); expect(s.in).toBeLessThan(i * 3.5 + 0.1); expect(s.efx).toBe("none"); expect(s.sp.label).toBe("1×"); });
    expect(ES.edit.some((s) => s.cs?.fit)).toBe(false);   // a phone's upright video fills the Reel
    const mix = await e.call("talkMix", { name: "t.wav" }).catch((x: Error) => x.message);
    expect(mix).toBeTruthy();
  });
  it("fits a wide video whole over its blurred copy", async () => {
    const e = phone(talkSound(2, 2, 1), 1920, 1080);
    await e.call("clips", { paths: [{ path: "/wide.mp4", name: "wide.mp4" }] });
    await e.call("talk", { captions: false });
    expect(stateOf(e).edit.every((s) => s.cs?.fit === true && s.cs.bg === "blur")).toBe(true);
  });
  it("says so when no one talks", async () => {
    const e = phone(new Float32Array(SR * 4), 1080, 1920);
    await e.call("clips", { paths: [{ path: "/quiet.mp4", name: "quiet.mp4" }] });
    await expect(e.call("talk", { captions: false })).rejects.toThrow(/could not hear anyone talking/);
  });
});
