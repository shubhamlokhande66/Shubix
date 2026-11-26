// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Ask Shubix before the Reel has its Shubix AI plan ("make it fast" on a Free account with its 10 welcome credits): the
 * message is part of that Reel's plan, paid by the Reel's credits once; it is not charged again as a chat change (that
 * second charge failed with too few credits and the phone said "Shubix AI is not available right now", 2026-11-26). */
const st = vi.hoisted(() => ({ reelTaken: 10, chatThrows: false, calls: [] as string[] }));
vi.mock("@/server/core/http", () => ({ route: (fn: (req: Request) => Promise<unknown>) => (req: Request) => fn(req) }));
vi.mock("@/server/core/features", () => ({ requireFeature: async () => undefined }));
vi.mock("@/server/core/admin", () => ({ isPlanAdmin: async () => false }));
vi.mock("@/server/core/rateLimit", () => ({ limits: { ai: () => undefined } }));
vi.mock("@/server/core/body", () => ({ body: async (req: Request) => req.json() }));
vi.mock("@/server/studio/styles", () => ({ trendText: async () => "" }));
vi.mock("@/server/studio/brain", () => ({ recordRun: () => undefined, taste: async () => "" }));
vi.mock("@/server/studio/direct", () => ({
  DirectIn: {}, planChanged: () => true, directPatch: async () => ({ slots: [] }), directVariants: async () => ({}),
  direct: async () => ({ slots: [{ transition: "hard", effect: "none", keys: [] }], provider: "p", model: "m" }),
}));
vi.mock("@/server/credits", () => ({
  requireAiPlan: async () => ({ ok: true }),
  balanceNow: async () => 0,
  reelChargeKey: async () => "reel1",
  chargeOnce: async () => { st.calls.push("reel"); return { taken: st.reelTaken, ref: "studio_ai:u:reel1" }; },
  chatTurn: async () => {
    st.calls.push("chat");
    if (st.chatThrows) throw Object.assign(new Error("This needs 1 credit, you have 0."), { status: 402 });
    return { taken: 1, ref: "c", free: false, used: 1, left: 0, undo: async () => { st.calls.push("chat-undo"); } };
  },
  markDelivered: async () => { st.calls.push("delivered"); },
  refund: async () => undefined,
  refundUndelivered: async () => { st.calls.push("refund"); return 10; },
}));

const ask = async (o: { chat?: boolean } = {}) => {
  const { POST } = await import("../../src/routes/api/studio/direct/route");
  const d = { reelId: "r1", slots: [{ t: 0, candidates: [{ id: "a" }] }], ...(o.chat ? { chat: { n: 1, id: "m1", text: "make it fast with zoom on the drop" } } : {}) };
  return (POST as unknown as (req: Request) => Promise<Record<string, unknown>>)(new Request("http://x/api/studio/direct", { method: "POST", body: JSON.stringify(d) }));
};

beforeEach(() => { st.reelTaken = 10; st.chatThrows = false; st.calls = []; });

describe("Ask Shubix with the Reel's first Shubix AI plan", () => {
  it("charges the Reel once and not the message with it", async () => {
    const res = await ask({ chat: true });
    expect(st.calls).toEqual(["reel", "delivered"]);
    expect(res.chat).toBeUndefined();
  });
  it("charges a message on a Reel already paid for (a change of it)", async () => {
    st.reelTaken = 0;
    const res = await ask({ chat: true });
    expect(st.calls).toEqual(["reel", "chat", "delivered"]);
    expect(res.chat).toMatchObject({ charged: 1 });
  });
  it("a message that cannot be paid gives the Reel's credits back", async () => {
    st.reelTaken = 0; st.chatThrows = true;
    await expect(ask({ chat: true })).rejects.toThrow(/needs 1 credit/);
    expect(st.calls).toEqual(["reel", "chat", "refund"]);
  });
});
