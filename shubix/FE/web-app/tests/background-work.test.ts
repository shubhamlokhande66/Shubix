import { afterEach, describe, expect, it, vi } from "vitest";
import { breathe } from "@/lib/background";
import { frameAt, halvings } from "@/lib/smallFrames";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("work in a hidden page", () => {
  it("goes on without timers (browsers slow a hidden page's timers)", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const timer = vi.spyOn(globalThis, "setTimeout");
    let n = 0; await Promise.all(Array.from({ length: 20 }, async () => { await breathe(); n++; }));
    expect(n).toBe(20); expect(timer).not.toHaveBeenCalled();
  });
  it("a visible page breathes with a timer, so it can draw", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout"); await breathe(); expect(timer).toHaveBeenCalledOnce();
  });
});
describe("small frames", () => {
  it("halved until the last step is at most two to one", () => {
    expect(halvings(1080, 1920, 64, 114)).toBe(4); expect(halvings(120, 200, 64, 114)).toBe(0); expect(halvings(256, 456, 64, 114)).toBe(2);
  });
  it("the frame on screen at a time", () => {
    const l = [0, 0.033, 0.066].map((t) => ({ t }));
    expect(frameAt(l, -0.01)).toBeNull(); expect(frameAt(l, 0.05)).toBe(l[1]); expect(frameAt(l, 0.066)).toBe(l[2]); expect(frameAt(l, 9)).toBe(l[2]);
  });
});
