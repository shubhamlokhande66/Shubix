import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

/** The subject pop in the Android brain (core.ts subjectPop, as the website's engine.ts): the phone's frames and cut-out
 * stand in (edit-repairs world with `pop`). Shubix offers one by itself, the native renderer gets its growth, deleting it is
 * kept, and Pop out makes one on demand. */
type Layer = { pop?: string; t0: number; t1: number; s: number; grow?: { s: number }; shade?: number };
const until = async (ok: () => boolean, ms = 4000) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); return ok(); };

describe("the subject pop on Android", () => {
  it("is offered by itself before a shot, grows, and is drawn by the phone", async () => {
    const w = world(4, 7, { pop: true });
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    const ES = (w.e.host() as unknown as { ES: { layers: Layer[]; edit: { start: number; tr?: string }[] } }).ES;
    expect(await until(() => ES.layers.some((L) => L.pop))).toBe(true);
    const L = ES.layers.find((x) => x.pop)!;
    expect(L.pop).toBe("auto");
    expect(L.t1).toBeGreaterThan(L.t0);
    expect(L.grow?.s).toBe(0.4); expect(L.shade).toBeGreaterThan(0);
    const shot = ES.edit.find((e) => Math.abs(e.start - L.t1) < 1e-6);
    expect(shot?.tr).toBe("hard");   // the cut into its shot is plain
    const list = await w.e.call("layerList") as { native: { path: string; grow?: unknown; shade?: number } | null; pop: string | null }[];
    const n = list.find((x) => x.pop)!;
    expect(n.native?.path).toBe("/pop.png"); expect(n.native?.grow).toEqual(L.grow); expect(n.native?.shade).toBe(L.shade);
  });
  it("once deleted, is not offered again; Pop out still makes one", async () => {
    const w = world(4, 7, { pop: true });
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    const ES = (w.e.host() as unknown as { ES: { layers: Layer[] } }).ES;
    await until(() => ES.layers.some((L) => L.pop));
    await w.e.call("layerSelect", { index: ES.layers.findIndex((L) => L.pop) }); await w.e.call("layerDelete");
    expect(ES.layers.some((L) => L.pop)).toBe(false);
    const r = await w.e.call("subjectPop") as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(ES.layers.filter((L) => L.pop).map((L) => L.pop)).toEqual(["mine"]);
  });
  it("without the phone's subject tools there is no pop, and nothing breaks", async () => {
    const w = world(3, 11);
    await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
    const ES = (w.e.host() as unknown as { ES: { layers: Layer[]; edit: unknown[] } }).ES;
    await new Promise((r) => setTimeout(r, 300));
    expect(ES.edit.length).toBeGreaterThan(0); expect(ES.layers.some((L) => L.pop)).toBe(false);
  });
});
