// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chooseSong, SongFields } from "../../src/server/songs";

/** The song library: an admin's details are checked (a licence is required, moods only from the list), and the song a
 * Reel gets follows the clips' energy and the template's kind, is long enough, is not the one used last, and stays the
 * same for one Reel. */
const S = (id: string, moods: string[], bpm: number | null, dur = 60) => ({ id, moods, bpm, dur });
const lib = [S("a", ["energetic"], 128), S("b", ["calm", "cinematic"], 80), S("c", ["romantic"], 90), S("d", ["devotional", "festive"], 100), S("e", ["happy"], 110), S("f", ["energetic"], 140, 10)];

describe("an admin's song details", () => {
  it("needs a licence; moods only from the list; bpm when it is one", () => {
    expect(SongFields.safeParse({ name: "Track" }).success).toBe(false);
    const p = SongFields.parse({ name: "Track", licence: "Pixabay Content License", moods: "Energetic, party, calm", bpm: "128" });
    expect(p.moods).toEqual(["energetic", "calm"]); expect(p.bpm).toBe(128);
    expect(SongFields.parse({ name: "T", licence: "Bought", bpm: "999" }).bpm).toBeNull();
  });
});

describe("choosing the song for the clips", () => {
  it("action clips get an energetic song; calm clips a calm one", () => {
    expect(chooseSong(lib, { energy: 0.8, seed: 1, minDur: 20 })!.id).toBe("a");          // f is energetic but too short
    expect(chooseSong(lib, { energy: 0.1, seed: 1 })!.id).toBe("b");
  });
  it("the template's kind wins: a wedding gets a romantic song, Ganpati a devotional one", () => {
    expect(chooseSong(lib, { energy: 0.9, kind: "wedding", seed: 3 })!.id).toBe("c");
    expect(chooseSong(lib, { energy: 0.5, kind: "ganpati", seed: 3 })!.id).toBe("d");
  });
  it("never the song used last; the same Reel gets the same song", () => {
    expect(chooseSong(lib, { energy: 0.8, seed: 1, minDur: 20, last: "a" })!.id).not.toBe("a");
    expect(chooseSong(lib, { energy: 0.5, seed: 7 })).toEqual(chooseSong(lib, { energy: 0.5, seed: 7 }));
  });
  it("an empty library: no song", () => { expect(chooseSong([], { energy: 0.5, seed: 1 })).toBeNull(); });
});
