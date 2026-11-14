// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BrollIn, brollPrompt, makeBroll } from "../../src/server/studio/broll";

/** Fast Studio's AI pictures: bounded requests, a prompt with the style and the Reel's shape and no text, the picture at
 * the Reel's size, the HD service when asked or when the free one fails, and a clear error when none is connected. */
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
const size = async (dataUrl: string) => { const m = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata(); return [m.width, m.height]; };

describe("AI pictures", () => {
  it("checks the request and writes the prompt", () => {
    expect(BrollIn.safeParse({ prompt: "x" }).success).toBe(false);
    expect(BrollIn.safeParse({ prompt: "a".repeat(401) }).success).toBe(false);
    const p = brollPrompt(BrollIn.parse({ prompt: "chai stall in the rain", style: "cinematic", aspect: "16:9" }));
    expect(p).toMatch(/cinematic/i); expect(p).toContain("chai stall in the rain"); expect(p).toMatch(/16:9/); expect(p).toMatch(/No text/);
  });
  it("makes the picture at the Reel's shape with the free service first", async () => {
    let used = "";
    const r = await makeBroll(BrollIn.parse({ prompt: "sunrise over Sinhagad fort", aspect: "9:16" }), { free: async () => { used = "free"; return { data: await png(1024, 1024) }; }, hd: async () => { used = "hd"; return { data: await png(10, 10) }; } });
    expect(used).toBe("free"); expect(r.source).toBe("free_ai");
    expect(await size(r.image)).toEqual([1080, 1920]);
  });
  it("HD when asked, and the HD service when the free one fails", async () => {
    const hd = async () => ({ data: await png(1024, 1536) });
    expect((await makeBroll(BrollIn.parse({ prompt: "a red scooter", hd: true }), { free: async () => ({ data: await png(9, 9) }), hd })).source).toBe("paid_ai");
    const r = await makeBroll(BrollIn.parse({ prompt: "a red scooter", aspect: "1:1" }), { free: async () => { throw new Error("busy"); }, hd });
    expect(r.source).toBe("paid_ai"); expect(await size(r.image)).toEqual([1080, 1080]);
  });
  it("says so when no service is connected or all fail", async () => {
    await expect(makeBroll(BrollIn.parse({ prompt: "a red scooter" }), { free: null, hd: null })).rejects.toMatchObject({ code: "BROLL_UNAVAILABLE" });
    await expect(makeBroll(BrollIn.parse({ prompt: "a red scooter" }), { free: async () => { throw new Error("down"); } })).rejects.toMatchObject({ code: "BROLL_FAILED" });
  });
});
