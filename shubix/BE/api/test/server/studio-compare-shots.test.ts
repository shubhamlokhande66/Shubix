// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ManagedProvider } from "../../src/server/ai";
import { CompareIn, compareShots, MAX_MOMENTS, parseCompare } from "../../src/server/studio/compareShots";

const JPEG = "/9j/" + "A".repeat(200), m = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `${i}_0`, image: JPEG }));
describe("the Reel's moments side by side", () => {
  it("takes 2 to 30 different JPEGs", () => {
    expect(CompareIn.safeParse({ moments: m(2) }).success).toBe(true);
    for (const bad of [m(1), m(MAX_MOMENTS + 1), [m(1)[0], m(1)[0]], [{ id: "a", image: "x" }, m(1)[0]]]) expect(CompareIn.safeParse({ moments: bad }).success).toBe(false);
  });
  it("places every moment; left out is in the middle, unknown numbers are ignored", () => {
    expect(parseCompare(["a", "b", "c"], { openings: [2, 2, 1, 9], order: [3, 1] })).toEqual([{ id: "a", open: 0, pos: 1 }, { id: "b", open: 1, pos: 0.5 }, { id: "c", open: 0.5, pos: 0 }]);
  });
  it("an answer that orders nothing is refused", () => expect(() => parseCompare(["a", "b", "c"], { openings: [], order: [] })).toThrow());
  it("the numbers go back to the moments they were shown for", async () => {
    const pics: string[] = [];
    const p = { name: "f", model: "f", visionModel: "f", async visionStructured(_s: string, _u: string, images: Buffer[]) { pics.push(...images.map((b) => b.toString("base64"))); return { openings: [1, 2, 3], order: [1, 2, 3] }; } } as unknown as ManagedProvider;
    const moments = ["AAAA", "BBBB", "CCCC"].map((x, i) => ({ id: `${i}_0`, image: "/9j/" + x }));
    const r = await compareShots({ moments }, p);
    expect(moments.find((x) => x.id === r.moments.find((y) => y.open === 1)!.id)!.image).toBe(pics[0]);
  });
});
