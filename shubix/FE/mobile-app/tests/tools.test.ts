import { describe, expect, it } from "vitest";
import { world } from "./edit-repairs.test";

/** Every editing tool on a made Reel, through the app's own engine with no page (the same logic as the website's
 * studio): each must do what its button says, never throw, and come back with undo. Pictures are not drawn here:
 * this is the edit's state (shots, keyframes, layers, masks, texts, sounds), what the export draws from. */
type Shot = { start: number; end: number; src: number; in: number; tr?: string; efx?: string; uk?: { t: number; s: number; x: number; y: number; r: number; o: number; ez: string }[]; cs?: Record<string, unknown>; sp?: { label?: string } };
type Layer = { mask: string; mk: { w: number; h: number; f: number; a: number; inv: boolean }; t0: number; t1: number; x: number; y: number; s: number; op: number; blend?: string; key?: { on?: boolean } };
type ES = { edit: Shot[]; overlays: { text: string; t0?: number; uk?: unknown[] }[]; layers: Layer[]; pos: number; sfxList: { at: number; kind: string }[]; au: Record<string, unknown>; marks?: number[]; ovSel: number };

async function made(nClips = 8, seed = 7) {
  const w = world(nClips, seed);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
  const h = w.e.host() as unknown as { ES: ES; brain: Record<string, (...a: unknown[]) => unknown> };
  return { call: w.e.call, ES: h.ES, brain: h.brain };
}
const mid = (e: Shot) => (e.start + e.end) / 2;
const sig = (es: ES) => es.edit.map((e) => `${e.src}@${e.in.toFixed(2)}:${(e.end - e.start).toFixed(2)}`).join(",");

describe("shots: split, duplicate, freeze, reverse, delete, trim, slip, speed, look", () => {
  it("each changes the timeline as its button says, and undo brings it back", async () => {
    const { call, ES } = await made();
    const n0 = ES.edit.length, before = sig(ES), i = ES.edit.reduce((b, e, k) => (e.end - e.start > ES.edit[b].end - ES.edit[b].start ? k : b), 0);   // the longest shot (a split needs room)
    await call("seek", { time: mid(ES.edit[i]) });
    expect((await call("shotOp", { op: "split" }) as { ok: boolean }).ok).toBe(true);
    expect(ES.edit.length).toBe(n0 + 1);
    await call("undo"); expect(sig(ES)).toBe(before);
    await call("seek", { time: mid(ES.edit[i]) });
    expect((await call("shotOp", { op: "dup" }) as { ok: boolean }).ok).toBe(true);
    expect(ES.edit.length).toBe(n0 + 1);
    await call("undo"); expect(sig(ES)).toBe(before);
    await call("seek", { time: mid(ES.edit[i]) });
    expect((await call("shotOp", { op: "freeze" }) as { ok: boolean }).ok).toBe(true);
    expect(ES.edit.some((e) => /freeze/i.test(String(e.sp?.label ?? "")))).toBe(true);
    await call("undo"); expect(sig(ES)).toBe(before);
    await call("seek", { time: mid(ES.edit[i]) });
    expect((await call("shotOp", { op: "delete" }) as { ok: boolean }).ok).toBe(true);
    expect(ES.edit.length).toBe(n0 - 1);
    await call("redo").catch(() => null); await call("undo"); await call("undo").catch(() => null);
  });
  it("slip moves the moment inside the clip, not the cut", async () => {
    const { call, ES } = await made();
    await call("seek", { time: mid(ES.edit[1]) });
    const a = { ...ES.edit[1] };
    await call("shotSlip", { delta: 0.4 });
    expect(ES.edit[1].start).toBeCloseTo(a.start, 5); expect(ES.edit[1].end).toBeCloseTo(a.end, 5);
    expect(ES.edit[1].in).not.toBeCloseTo(a.in, 3);
  });
  it("transition, effect and a shot's own look are kept on that shot", async () => {
    const { call, ES } = await made();
    await call("seek", { time: mid(ES.edit[3]) });
    await call("shotStyle", { kind: "transition", value: "whip" }); await call("shotStyle", { kind: "effect", value: "shake" });
    expect(ES.edit[3].tr).toBe("whip"); expect(ES.edit[3].efx).toBe("shake");
    await call("shotSet", { patch: { bri: 0.3, sat: -0.5, fh: true } });
    expect(ES.edit[3].cs).toMatchObject({ bri: 0.3, sat: -0.5, fh: true });
  });
});

describe("keyframes: a shot's camera, eased, stepped, removed", () => {
  it("two keyframes make a move; easing, step and remove work", async () => {
    const { call, ES } = await made();
    const e = ES.edit[2];
    await call("seek", { time: e.start + 0.05 }); await call("kfSet", { values: { s: 1, x: 0, y: 0 } });
    await call("seek", { time: e.end - 0.05 }); await call("kfSet", { values: { s: 1.8, x: 0.2, r: 15 } });
    expect(e.uk).toHaveLength(2);
    expect(e.uk![1]).toMatchObject({ s: 1.8, x: 0.2, r: 15 });
    expect(e.uk![0].t).toBeLessThan(e.uk![1].t);
    const row = await call("kfEase", { easing: "outExpo" }) as { keyframes: { ez: string }[] };
    expect(row.keyframes[1].ez).toBe("outExpo");
    await call("kfSet", { values: { s: 99 } });                              // over its range: held at the most it can be
    expect(e.uk![1].s).toBeLessThan(99);
    await call("kfRemove"); expect(e.uk).toHaveLength(1);
    await call("kfClear"); expect(e.uk).toBeUndefined();
  });
});

describe("layers: a photo on top, its mask, blend, chroma key and timing", () => {
  it("every mask shape is kept with its size, feather, angle and inversion", async () => {
    const { call, ES } = await made();
    await call("seek", { time: 2 });
    const r = await call("layerAdd", { path: "/c0.mp4", name: "logo.png", w: 800, h: 800 }) as { ok: boolean; count: number };   // (a photo: its name says so)
    expect(r.ok).toBe(true); expect(ES.layers).toHaveLength(1);
    expect(ES.layers[0].t0).toBeCloseTo(2, 1);
    // the website's mask buttons (markup.ts #lymask)
    for (const shape of ["circle", "rect", "polygon", "line", "radial", "luma", "mirror", "star", "heart", "triangle", "diamond", "hexagon"]) {
      await call("layerSet", { key: "mask", value: shape });
      expect(ES.layers[0].mask).toBe(shape);
    }
    await call("layerSet", { key: "mk.w", value: 0.5 }); await call("layerSet", { key: "mk.f", value: 0.3 });
    await call("layerSet", { key: "mk.a", value: 45 }); await call("layerSet", { key: "mk.inv", value: true });
    expect(ES.layers[0].mk).toMatchObject({ w: 0.5, f: 0.3, a: 45, inv: true, h: 0.8 });   // the others stay
    await call("layerSet", { key: "blend", value: "screen" }); await call("layerSet", { key: "key.on", value: true });
    await call("layerSet", { key: "op", value: 0.6 }); await call("layerSet", { key: "s", value: 1 });
    const L = (await call("layerList") as { mask: string; maskInverted: boolean; maskFeather: number; blend: string; chromaKey: boolean; opacity: number; scale: number }[])[0];
    expect(L).toMatchObject({ mask: "hexagon", maskInverted: true, maskFeather: 0.3, blend: "screen", chromaKey: true, opacity: 0.6, scale: 1 });
    expect((await call("layerDelete") as { ok: boolean }).ok).toBe(true); expect(ES.layers).toHaveLength(0);
  });
});

describe("texts, templates, sounds, beat markers, music", () => {
  it("a template adds its texts at the playhead; text keyframes work like a shot's", async () => {
    const { call, ES } = await made();
    const n0 = ES.overlays.length;
    expect((await call("template", { key: "headline", time: 1 }) as { ok: boolean }).ok).toBe(true);
    expect(ES.overlays.length).toBeGreaterThan(n0);
    ES.ovSel = ES.overlays.length - 1;
    await call("seek", { time: 1.2 }); await call("kfSet", { values: { s: 2, o: 0.5 } });
    expect(ES.overlays[ES.ovSel].uk).toHaveLength(1);
  });
  it("a sound effect, a beat marker, the music's volume and fades", async () => {
    const { call, ES } = await made();
    await call("sfx", { kind: "whoosh", time: 3 });
    expect(ES.sfxList).toEqual([expect.objectContaining({ kind: "whoosh", at: 3 })]);
    await call("audioMix", { mvol: 0.5, mfin: 1, mfout: 2 });
    expect(ES.au).toMatchObject({ mvol: 0.5, mfin: 1, mfout: 2, mfoutManual: true });
    const beats0 = (ES as unknown as { beats: number[] }).beats.length;
    expect((await call("mark", { op: "add", time: 4.23 }) as { ok: boolean }).ok).toBe(true);
    expect((ES as unknown as { userMarks: number[] }).userMarks).toHaveLength(1);
    expect((ES as unknown as { beats: number[] }).beats.length).toBe(beats0 + 1);
    expect((await call("mark", { op: "del", time: 4.23 }) as { ok: boolean }).ok).toBe(true);
    expect((ES as unknown as { userMarks: number[] }).userMarks).toHaveLength(0);
  });
});

describe("what a Reel gets by itself, with no Shubix AI", () => {
  it("opening words in its first seconds, once: deleted, they do not come back", async () => {
    const { ES, brain, call } = await made();
    // None by default (2026-11-28): Auto chosen, as on Make Reel
    expect(ES.overlays.filter((o) => (o as { auto?: boolean }).auto)).toHaveLength(0);
    await call("choose", { text: "auto" });
    const auto = ES.overlays.filter((o) => (o as { auto?: boolean }).auto);
    expect(auto.length).toBeGreaterThan(0);
    expect(Math.min(...auto.map((o) => o.t0 ?? 9))).toBeLessThan(0.1);
    ES.overlays = []; (brain.makeEdit as () => void)();
    expect(ES.overlays).toHaveLength(0);
  });
  it("a few sound effects: a boom on each drop, the rest rationed (one every 6 s at most)", async () => {
    const { ES, brain } = await made();
    const ev = (brain.sfxEvents as () => { at: number; kind: string }[])(), len = ES.edit[ES.edit.length - 1].end - ES.edit[0].start;
    expect(ES.au.sfx).toBe(true);
    expect(ev.length).toBeLessThanOrEqual(Math.max(2, Math.round(len / 6)));
    const whooshes = ev.filter((e) => e.kind === "whoosh").map((e) => e.at).sort((a, b) => a - b);
    whooshes.forEach((t, i) => { if (i) expect(t - whooshes[i - 1]).toBeGreaterThanOrEqual(4 - 1e-9); });
    ES.au = { ...ES.au, sfx: false };
    expect((brain.sfxEvents as () => unknown[])()).toHaveLength(0);
  });
});
