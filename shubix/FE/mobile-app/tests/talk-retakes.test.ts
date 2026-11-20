import { describe, expect, it } from "vitest";
import { findRetakes, wordKey, wordsWithout, type TalkPart, type TalkWord } from "@mobile/video-engine";

// Retakes in a talking video (Shared/video-engine retakes.ts): a line said again soon after; the last take is kept.
/** a talk from its parts' sentences: each part 0.4 s a word, a 0.6 s pause between parts */
function talk(lines: string[]) {
  const parts: TalkPart[] = [], words: TalkWord[] = []; let t = 0;
  for (const line of lines) {
    const ws = line.split(" "), t0 = t;
    ws.forEach((w) => { words.push({ text: w, start: t, end: t + 0.35 }); t += 0.4; });
    parts.push({ t0, t1: t }); t += 0.6;
  }
  return { parts, words };
}

describe("retakes in a talk", () => {
  it("leaves out a line said again, and keeps the last take", () => {
    const { parts, words } = talk(["Hi everyone, welcome to my channel", "Today I am going to shwo", "Today I am going to show you my morning routine", "Let's start."]);
    expect(findRetakes(parts, words)).toEqual({ drop: [1], againIn: [2] });
  });
  it("finds a false start, in Hindi too", () => {
    const { parts, words } = talk(["तो आज मैं", "तो आज मैं आपको अपना घर दिखाता हूँ", "चलिए शुरू करते हैं"]);
    expect(findRetakes(parts, words).drop).toEqual([0]);
  });
  it("keeps lines that only share a few words, a repeat far away, the last part and a one-word part", () => {
    const own = talk(["I love this place", "I love the food here more than anything", "This is the end"]);
    expect(findRetakes(own.parts, own.words).drop).toEqual([]);
    const far = talk(["Subscribe for more videos", "a", "b", "c", "Subscribe for more videos"]);
    expect(findRetakes(far.parts, far.words).drop).toEqual([]);   // four parts later: a sign-off, not a retake
    const ok = talk(["Okay", "Okay so let's go"]);
    expect(findRetakes(ok.parts, ok.words).drop).toEqual([]);
  });
  it("takes out at most a third of the talk", () => {
    const { parts, words } = talk(["one two three four", "one two three four", "one two three four", "one two three four"]);
    const r = findRetakes(parts, words);
    expect(r.drop.length).toBe(1);
  });
  it("moves the words with their parts, so the captions are not heard again", () => {
    const { parts, words } = talk(["Today I am going to shwo", "Today I am going to show you"]);
    const out = wordsWithout(parts, words, [0]);
    expect(out.map((w) => w.text).join(" ")).toBe("Today I am going to show you");
    expect(out[0].start).toBe(0);
    expect(out[out.length - 1].end).toBeLessThanOrEqual(parts[1].t1 - parts[1].t0);
  });
  it("compares words as written in any script, without case or marks", () => {
    expect(wordKey("Hello,")).toBe("hello");
    expect(wordKey("हूँ।")).toBe("हूँ");
  });
});
