import { describe, expect, it } from "vitest";
import { createNativeEngine, previewCopyOf } from "../lib/nativeEngine";

// The editor's player reads a small copy of each big clip (960 on its long side, a key frame every 0.25 s), and the clip
// is read from it too (its readings are made on 128 x 72 and face-sized frames: the same from 960 as from 4K); the
// export and Shubix AI's pictures read the clip itself (2026-11-27: a beat Reel of ten 30 s high-resolution clips hung
// the phone while they were read, and stuttered at every cut in the preview).
describe("the preview's small copies", () => {
  it("are made for clips bigger than the player, at 960 on the long side", () => {
    expect(previewCopyOf(1080, 1920, 30)).toEqual({ w: 540, h: 960, bitrate: 3_000_000 });
    expect(previewCopyOf(3840, 2160, 30)).toEqual({ w: 960, h: 540, bitrate: 3_000_000 });
    expect(previewCopyOf(720, 1280, 30)?.h).toBe(960);
    expect(previewCopyOf(540, 960, 30)).toBeNull();
    expect(previewCopyOf(1080, 1920, 0)).toBeNull();
  });
  it("are made as each clip is read, read in its place, and named by the clip", async () => {
    const asked: string[] = [], scanned: string[] = [], faced: string[] = [];
    const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => String(body), json: async () => body, arrayBuffer: async () => body as ArrayBuffer });
    const sizes: Record<string, [number, number]> = { "/a.mp4": [1080, 1920], "/b.mp4": [540, 960] };
    const sound = new Float32Array(16000 * 5);
    const fetcher = async (url: string) => {
      const u = new URL(url), path = u.pathname.slice(1), p = u.searchParams.get("p") ?? "";
      if (path === "probe") return ok({ dur: 5, w: sizes[p][0], h: sizes[p][1] });
      if (path === "scan") scanned.push(p);
      if (path === "faces") faced.push(`${p} ${u.searchParams.get("w")}x${u.searchParams.get("h")}`);
      if (path === "scan") return ok(`0.5\n${JSON.stringify({ samples: Array.from({ length: 50 }, (_, i) => ({ t: i / 10, m: 0.01, b: 0.5, cx: 0.5, sh: 100, sx: 0.5, sy: 0.5, sw: 0 })), scenes: [] })}\n`);
      if (path === "faces") return ok("[]\n");
      if (path === "sound") { const out = new ArrayBuffer(8 + sound.byteLength), v = new DataView(out); v.setInt32(0, 16000, true); v.setInt32(4, 1, true); return ok(out); }
      if (path === "copy") { asked.push(u.search); return ok({ path: `/cache/small-${p.slice(1)}` }); }
      return { ok: false, status: 404, text: async () => "no", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const e = createNativeEngine({ base: "http://phone", key: "k", apiWait: 0, fetch: fetcher as never });
    await e.call("clips", { paths: [{ path: "/a.mp4", name: "1-a.mp4" }, { path: "/b.mp4", name: "2-b.mp4" }] });
    const pv = await e.call("previews", { wait: 5 }) as Record<string, string | null>;
    expect(pv).toEqual({ "1-a.mp4": "/cache/small-a.mp4" });   // the small clip plays as it is
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("w=540&h=960");
    expect(asked[0]).toContain("k=0.25");
    expect(scanned).toEqual(["/cache/small-a.mp4", "/b.mp4"]);
    expect(faced).toEqual(["/cache/small-a.mp4 1080x1920", "/b.mp4 540x960"]);   // faces placed on the clip's own size
    // the clip the Reel and its export use is the clip itself
    const ES = (e.host() as unknown as { ES: { sources: { path: string; w: number }[] } }).ES;
    expect(ES.sources.map((s) => [s.path, s.w])).toEqual([["/a.mp4", 1080], ["/b.mp4", 540]]);
  });
});
