// @ts-nocheck: run on a computer (Node's files, ffmpeg and a Reel in D:/Project/Instra), skipped without them; the app's typecheck has no Node types
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { readReel, type Pic } from "@mobile/video-engine";
import { createNativeEngine } from "../lib/nativeEngine";
import { TR_DUR } from "@mobile/core/lib/shaders";

// Copy a Reel on the phone: the Reel picked is read by the same reader as on the website (video-engine refReader.ts).
// The phone's file server is played here by ffmpeg: /frames gives the frame at or after each time asked (as
// FileServer.kt's readFrames), the website takes the frame showing at a time. The app must read the same frames, so the
// same cuts, transitions and moments, as the website's reader given the frame showing at each time.
const REEL = "D:/Project/Instra/VID_20261123_203313_339.mp4";
const have = fs.existsSync(REEL) && spawnSync("ffmpeg", ["-version"]).status === 0;

function decode(w: number, h: number) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", REEL, "-an", "-vf", `fps=30,scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1e9 });
  const size = w * h * 4, n = Math.floor(r.stdout.length / size);
  return Array.from({ length: n }, (_, i) => new Uint8Array(r.stdout.buffer, r.stdout.byteOffset + i * size, size));
}

describe.skipIf(!have)("Copy a Reel on the phone reads the Reel as the website does", () => {
  it("the same cuts, transitions and moments; the Reel made next is its copy", async () => {
    const small = decode(64, 114), big = decode(108, 192), dur = small.length / 30;
    const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => String(body), json: async () => body, arrayBuffer: async () => body as ArrayBuffer });
    let asked = 0;
    const fetcher = async (url: string, init?: { method?: string; body?: unknown }) => {
      const u = new URL(url), path = u.pathname.slice(1);
      if (path === "probe") return ok({ dur, w: 108, h: 192, fps: 30, size: 1 });   // (its size as the made-up decoder gives the big frames)
      if (path === "sound") return { ok: false, status: 404, text: async () => "no sound", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
      if (path === "scan") return ok(`0.5\n${JSON.stringify({ samples: [], scenes: [] })}\n`);
      if (path === "frames") {
        // the first frame at or after each time (8 ms rounding), as readFrames
        const w = Number(u.searchParams.get("w")), list = w === 64 ? small : big, ts = String(init!.body).split(",").map(Number); asked += ts.length;
        const parts = ts.map((t) => { const i = Math.ceil((t - 0.008) * 30 - 1e-9); return i < list.length ? list[Math.max(0, i)] : null; });
        const out = new Uint8Array(parts.reduce((s, p) => s + 1 + (p ? p.length : 0), 0)); let o = 0;
        for (const p of parts) { out[o++] = p ? 1 : 0; if (p) { out.set(p, o); o += p.length; } }
        return ok(out.buffer);
      }
      // Shubix AI: 10 frames as JPEGs, and what is written on the Reel (two text places, a sticker, its captions)
      if (path === "aiframes") return ok(String(init!.body).split(",").map(() => "jpeg"));
      if (path === "api/studio/ref-look") { const b = JSON.parse(String(init!.body)); expect(b.frames).toHaveLength(10);
        return ok({ texts: [{ x: 0.5, y: 0.2, h: 0.04, t0: 0, t1: dur, style: "bold", color: "#FFFFFF", anim: "pop" }, { x: 0.5, y: 0.8, h: 0.03, t0: 2, t1: 4, style: "clean", color: "#FFD700", anim: "fade" }],
          stickers: [{ emoji: "🔥", x: 0.8, y: 0.3, h: 0.05, t0: 1, t1: 2 }], captions: { style: "karaoke", color: "#FF3366" } }); }
      return { ok: false, status: 404, text: async () => "no", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const e = createNativeEngine({ base: "http://phone", key: "k", apiWait: 0, fetch: fetcher });
    const H = e.host() as unknown as { ES: Record<string, unknown>; values: Record<string, unknown> };
    H.ES.aiOn = true; H.values.aiReelOk = () => true;
    const got = await e.call("ref", { path: "/r.mp4", name: "r.mp4" }) as { cuts: number; shots: number };
    const ES = (e.host() as unknown as { ES: { refProfile: Record<string, unknown> & { moments: unknown[]; cuts: unknown[] }; mode: string; look: string } }).ES;
    expect(asked).toBeGreaterThan(30 * (dur - 1));   // every frame was read
    // the website: the frame showing at each time
    const web = await readReel({ dur, trDur: (k: string) => TR_DUR[k === "fade" ? "dip" : k] || 0, small: async (ts) => ts.map((t): Pic | null => { const i = Math.floor(t * 30); return i < small.length ? { width: 64, height: 114, data: small[i] } : null; }),
      looks: async (ts) => ts.map(() => null), scenes: [], samples: [], rb: null, rr: null, rmap: null, describeCut: () => ({}), onP: () => {} });
    expect(ES.refProfile.cuts).toEqual(web.cuts);
    expect(ES.refProfile.moments.map((m) => { const { mo: _m, br: _b, ...rest } = m as Record<string, unknown>; return rest; })).toEqual(web.moments);
    expect(got.cuts).toBeGreaterThan(5);
    expect(ES.mode).toBe("copy"); expect(ES.look).toBe("copy");
    expect(ES.refProfile.look).toBeTruthy();   // its colour look, read from bigger frames
    // what is written on it: its places, never its words, stretched to the new Reel (the website's refLookApply), on the Reel once made
    Object.assign(H.ES, { edit: [{ start: 0, end: 12 }], ovSeq: 0, overlays: [{ id: 99, text: "mine", t0: 0, t1: 1 }] }); H.values.reelLen = () => 12; H.values.setCaptions = undefined;
    await e.call("ready").catch(() => {});
    const ov = H.ES.overlays as Record<string, unknown>[], k = 12 / dur;
    expect(ov.map((o) => o.text)).toEqual(["mine", "YOUR TEXT", "YOUR TEXT", "🔥"]);
    expect(ov[1]).toMatchObject({ ph: true, all: true, t0: 0, t1: 12, style: "bold", x: 0.5, y: 0.2 });
    expect(ov[2]).toMatchObject({ ph: true, all: false, style: "clean", color: "#FFD700" });
    expect(ov[2].t0).toBeCloseTo(2 * k, 6); expect(ov[3]).toMatchObject({ emoji: true }); expect(ov[3].ph).toBeUndefined();
    expect(H.ES.textStyle).toBe("karaoke"); expect(H.ES.ACCENT).toBe("#FF3366");
    // a later "auto" (the clips step) keeps the copy
    await e.call("choose", { mode: "auto" }).catch(() => {});
    expect(ES.mode).toBe("copy");
  }, 600000);
});
