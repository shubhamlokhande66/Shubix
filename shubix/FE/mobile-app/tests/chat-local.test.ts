import { describe, expect, it } from "vitest";
import { createChatBrain } from "../engine/brain/chat";

// Ask Shubix on a Reel the phone's engine holds: a change made with no Shubix AI plan (slow motion, the Free plan's
// style words, a change to every clip) must come back to the phone as applied, or the phone keeps its old clips while
// the answer says "Done ✓". The website's engine.ts chatApp does the same (engine-parity keeps them alike).
const SLOW = { pos: (l: number) => l * 0.5 }, NORMAL = { pos: (l: number) => l };
function brain(over: Record<string, unknown> = {}, state: Record<string, unknown> = {}) {
  const ES: Record<string, unknown> = {
    chatMsgs: [], chatWaiting: false, aiBusy: false, dirBusy: false, paceBusy: false, chatPending: null,
    buf: {}, sources: [{}], edit: [{ sp: NORMAL }, { sp: NORMAL }], recording: false, kind: "music", mode: "music",
    aiOn: false, slowAll: false, playing: false, ...state,
  };
  const base: Record<string, unknown> = {
    aiHeldBack: () => false, slowWish: () => null, parseDirectorVisualIntent: () => ({}), chatLocal: () => [],
    aiLocked: () => false, IN_APP: true, SPEED: { slow: SLOW }, dirKey: () => "k",
    makeEdit: () => { if (ES.slowAll) (ES.edit as { sp: unknown }[]).forEach((e) => { e.sp = SLOW; }); },
    ...over,
  };
  const EH = new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => undefined) });
  return { ES, chat: createChatBrain(ES, EH) };
}

describe("Ask Shubix: a change made without Shubix AI reaches the phone", () => {
  it("the Free plan's style words: applied, with the answer that names them", async () => {
    let made = 0;
    const { chat } = brain({ chatLocal: () => ["the Fast style"], makeEdit: () => { made++; } });
    const r = await chat.chatApp("make it faster");
    expect(made).toBe(1);
    expect(r.applied).toBe(true);
    expect(r.answer).toMatch(/^Done ✓ I used the Fast style/);
  });

  it("slow motion asked for in words: applied", async () => {
    const { chat, ES } = brain({ slowWish: () => true });
    const r = await chat.chatApp("slow it down");
    expect(ES.slowAll).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.answer).toMatch(/slow motion/);
  });

  it("a change to every clip: applied", async () => {
    const { chat } = brain({ parseDirectorVisualIntent: () => ({ transitionAll: true }), applyChatVisualIntent: () => "transitions", histSnap: () => ({}), hist: { u: [], r: [] }, HIST_MAX: 50 });
    const r = await chat.chatApp("transition on all clips");
    expect(r.applied).toBe(true);
    expect(r.answer).toMatch(/^Done ✓ Applied transitions/);
  });

  it("nothing changed: still not applied (the phone keeps its clips)", async () => {
    const { chat } = brain();
    const r = await chat.chatApp("make it beautiful");
    expect(r.applied).toBe(false);
    expect(r.answer).toMatch(/Shubix AI is off/);
  });

  it("already in slow motion: not applied", async () => {
    const { chat } = brain({ slowWish: () => true }, { slowAll: true });
    const r = await chat.chatApp("slow motion");
    expect(r.applied).toBe(false);
    expect(r.answer).toMatch(/already in slow motion/);
  });

  it("a later question that changes nothing is not counted as the earlier change", async () => {
    let local = ["the Fast style"];
    const { chat } = brain({ chatLocal: () => local });
    expect((await chat.chatApp("faster")).applied).toBe(true);
    local = [];
    expect((await chat.chatApp("hello")).applied).toBe(false);
  });
});
