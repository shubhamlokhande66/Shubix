import { describe, expect, it } from "vitest";
import { shotWords } from "@mobile/video-engine";
import { world } from "./edit-repairs.test";

// "In my order" keeps the song's cuts inside a clip that has footage for them (agreed with ChatGPT, 2026-11-20): before,
// each clip was one shot, so 6 clips on a fast 22 s song with 15 cuts gave 6 shots of 3.7 s and the Reel did not cut on
// the beat. And Ask Shubix lists the shots the Reel really shows, in plain words ("one true shot plan").
type Shot = { start: number; end: number; src: number; in: number };
type Host = { ES: Record<string, any>; brain: Record<string, any> };

async function inOrder(nClips: number, seed: number) {
  const w = world(nClips, seed);
  await w.e.call("song", { path: "/s.mp3", name: "s.mp3" }); await w.e.call("clips", { paths: w.paths }); await w.e.call("ready");
  const { ES, brain } = w.e.host() as unknown as Host;
  ES.seqOn = true; brain.makeEditNow();
  return { ES, brain, edit: ES.edit as Shot[] };
}

describe("In my order cuts on the beat inside a clip", () => {
  // (the test world's song is 30 s at 120 bpm; 8 clips of 3-7 s are 39 s of video: a clip has room for its cuts. Fewer
  // clips than that are less video than the song, and each clip is one shot, slowed a little, as before)
  it("clips with footage to spare are more shots than clips, in the creator's order, each going forward", async () => {
    for (const [n, seed] of [[8, 5], [12, 19], [8, 9]] as const) {
      const { edit } = await inOrder(n, seed), src = edit.map((e) => e.src);
      expect(edit.length).toBeGreaterThan(n);
      expect(src.filter((s, i) => !i || s !== src[i - 1])).toEqual(Array.from({ length: n }, (_, i) => i));
      edit.forEach((e, i) => { if (i && e.src === edit[i - 1].src) expect(e.in).toBeGreaterThan(edit[i - 1].in + 0.3); });
    }
  });

  it("no shot inside a clip is shorter than the song's pace allows", async () => {
    const { edit, brain } = await inOrder(8, 5), min = brain.seqMinShot ? brain.seqMinShot() : 0.8;
    edit.forEach((e, i) => { const same = (i && edit[i - 1].src === e.src) || (i < edit.length - 1 && edit[i + 1].src === e.src);
      if (same) expect(e.end - e.start).toBeGreaterThanOrEqual(Math.min(min, 0.8) - 0.05); });
  });

  it("Ask Shubix lists exactly the shots the Reel shows, in plain words", async () => {
    const { edit, brain } = await inOrder(8, 5), lines: string[] = brain.shotLines();
    expect(lines.length).toBe(edit.length);
    lines.forEach((l, i) => {
      expect(l).toContain(`Clip ${edit[i].src + 1}`);
      expect(l).not.toMatch(/@|↪|✦|◆|⏱|\.mp4/);
    });
  });
});

describe("shotWords", () => {
  it("reads like a person wrote it", () => {
    expect(shotWords({ start: 7.2, type: "drop", clip: 3, at: 4.2, what: "couple under the sparklers", transition: "Whip pan (blur)", effect: "Shake", keys: ["punch"] }))
      .toBe("0:07 · Beat drop · Clip 3 from 0:04 — couple under the sparklers · Whip pan · Shake · zoom punch on the beat");
    expect(shotWords({ start: 0, first: true, clip: 1, at: 0 })).toBe("0:00 · Opening · Clip 1 from 0:00");
  });
});
