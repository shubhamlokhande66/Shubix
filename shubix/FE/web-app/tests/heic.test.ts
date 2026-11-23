import { describe, expect, it } from "vitest";
import { hevcCodecs, isHeicFile, parseHeic } from "@/lib/heic";
import { heicFile } from "./heicFile";

const hvcC = Uint8Array.from([1, 3, 0x70, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 90, 0xf0, 0, 0xfc, 0xfd, 0xf8, 0xf8, 0, 0, 0x0f, 0]);
const tiles = [1, 2, 3, 4].map((n) => Uint8Array.from([n, n, n]));

describe("HEIC photos", () => {
  it("one picture: its data, size and decoder set-up", () => {
    const h = parseHeic(heicFile({ w: 64, h: 48, tileW: 64, tileH: 48, cols: 1, rows: 1, tiles: tiles.slice(0, 1), hvcC }));
    expect(h).toMatchObject({ w: 64, h: 48, cols: 1, rows: 1, turns: [] });
    expect(Array.from(h.tiles[0].data)).toEqual([1, 1, 1]);
    expect(Array.from(h.hvcC)).toEqual(Array.from(hvcC));
  });
  it("an iPhone photo: tiles in order, cut to the real size, turned", () => {
    const h = parseHeic(heicFile({ w: 100, h: 90, tileW: 64, tileH: 64, cols: 2, rows: 2, tiles, hvcC, rot: 3 }));
    expect(h).toMatchObject({ w: 100, h: 90, tileW: 64, tileH: 64, cols: 2, rows: 2, turns: [{ rot: 3 }] });
    expect(h.tiles.map((t) => t.data[0])).toEqual([1, 2, 3, 4]);
  });
  it("the decoder is asked for the file's own profile, then plain Main", () => {
    expect(hevcCodecs(hvcC)).toEqual(["hvc1.3.E.L90.90", "hvc1.1.6.L90.B0", "hvc1.1.6.L186.B0"]);
  });
  it("what is no HEIC, or is cut short, is refused", () => {
    expect(() => parseHeic(new Uint8Array(40))).toThrow(/HEIC/);
    const f = heicFile({ w: 64, h: 48, tileW: 64, tileH: 48, cols: 1, rows: 1, tiles: tiles.slice(0, 1), hvcC });
    expect(() => parseHeic(f.slice(0, f.length - 2))).toThrow();
    expect(isHeicFile({ name: "IMG_1.HEIC" })).toBe(true); expect(isHeicFile({ name: "a.jpg" })).toBe(false);
  });
});
