import crypto from "node:crypto";
import { trendText } from "../../../../server/studio/styles";
import { isPlanAdmin } from "../../../../server/core/admin";
import { body } from "../../../../server/core/body";
import { balanceNow, chargeOnce, chatTurn, markDelivered, reelChargeKey, refund, refundUndelivered, requireAiPlan } from "../../../../server/credits";
import { chatSize } from "@shubix/core/lib/chatSize";
import { requireFeature } from "../../../../server/core/features";
import { route } from "../../../../server/core/http";
import { recordRun, taste } from "../../../../server/studio/brain";
import { direct, DirectIn, directPatch, directVariants, planChanged } from "../../../../server/studio/direct";
import { limits } from "../../../../server/core/rateLimit";

/** Fast Studio's AI director: for every cut, which offered moment, its transition, effect, speed and the keyframes on
 * its hits, decided from the music map and the footage. The phone checks that each choice can be played. */
export const POST = route(async (req) => {
  await requireFeature(req, "studioAI");
  const d = await body(req, DirectIn), t0 = Date.now();
  await requireAiPlan(await isPlanAdmin(req), { credits: true, reelId: d.reelId }); // paid with credits: Free may use it with credits (Admin → Marketing)
  limits.ai(req); // each AI call costs money
  // the Reel's AI (once per Reel), then the chat message it answers (once per message: small or the whole Reel)
  // (another plan for a Reel that already has one is a new Reel: its own charge. A chat message and New mix have their own charges)
  const planPrint = crypto.createHash("sha256").update(JSON.stringify(d.slots.map((s) => [s.t, s.candidates?.map((c) => c.id)]))).digest("hex").slice(0, 16);
  const reelCharge = await chargeOnce("studio_ai", d.chat || d.patch || d.variants ? d.reelId : await reelChargeKey("studio_ai", d.reelId, planPrint), "Shubix AI Reel");
  // the plan's first chat changes on a Reel are free (Editor 2, Pro 5); the rest use credits
  // a message that comes with the Reel's own plan (its credits taken just now: "make it fast" before the Reel was made with
  // Shubix AI) is part of that Reel, not a change of it: no second charge (2026-11-26: a Free account's 10 welcome credits
  // went to the Reel, the message's 1 credit failed and the popup said Shubix AI was down). Any failure gives the Reel's back.
  let chatCharge: Awaited<ReturnType<typeof chatTurn>> | null = null;
  try { chatCharge = d.chat && !reelCharge.taken ? await chatTurn(d.reelId, d.chat.id || `n${d.chat.n}`, chatSize(d.chat.text) === "small" ? "studio_chat_small" : "studio_chat_big", "Ask Shubix: " + d.chat.text.slice(0, 60)) : null; }
  catch (e) { await refundUndelivered(reelCharge.ref); throw e; }
  const chatOut = chatCharge ? { chat: { free: chatCharge.free, used: chatCharge.used, left: chatCharge.left, charged: chatCharge.taken } } : {};
  if (d.patch) {
    try { const res = await directPatch(d, undefined, await taste()); await markDelivered(reelCharge.ref); recordRun({ kind: "plan", cuts: res.slots.length, mode: d.mode, provider: res.provider, model: res.model, ms: Date.now() - t0, ok: true }); return { ...res, ...(await noChangeBack(d, res, chatCharge, chatOut)), balance: await balanceNow() }; }
    catch (e) { await chatCharge?.undo(); await refundUndelivered(reelCharge.ref); throw e; }
  }
  if (d.variants) {
    const mixCharge = await chargeOnce("studio_mix", `${d.reelId}:mix:${d.slots.length}:${d.slots.map((s) => s.t.toFixed(1)).join(",").slice(0, 120)}`, "Change Reel: Shubix's versions");
    // New mix: other plans for the same cuts, in one call
    try {
      const res = await directVariants(d, undefined, await taste(), await trendText(d.reelKind));
      recordRun({ kind: "mix", cuts: d.slots.length, mode: d.mode, provider: res.provider, model: res.model, ms: Date.now() - t0, ok: true });
      return res;
    } catch (e) {
      recordRun({ kind: "mix", cuts: d.slots.length, mode: d.mode, provider: "", model: "", ms: Date.now() - t0, ok: false });
      if (mixCharge.taken) await refund(mixCharge.ref);   // no new mix: its credits come back
      throw e;
    }
  }
  try {
    const res = await direct(d, undefined, await taste(), await trendText(d.reelKind)).catch(async (e) => { await chatCharge?.undo(); throw e; });
    await markDelivered(reelCharge.ref, planPrint);   // the Reel got its plan: its credits are spent
    recordRun({ kind: "plan", cuts: d.slots.length, mode: d.mode, provider: res.provider, model: res.model, ms: Date.now() - t0, ok: true,
      transitions: res.slots.filter((s) => s.transition && s.transition !== "hard").length,
      effects: res.slots.filter((s) => s.effect && s.effect !== "none").length, keys: res.slots.reduce((n, s) => n + s.keys.length, 0) });
    return { ...res, ...(await noChangeBack(d, res, chatCharge, chatOut)), balance: await balanceNow() };
  } catch (e) {
    recordRun({ kind: "plan", cuts: d.slots.length, mode: d.mode, provider: "", model: "", ms: Date.now() - t0, ok: false });
    // no plan for this Reel yet (the first one failed): its credits come back; a Reel already planned keeps them
    await refundUndelivered(reelCharge.ref);
    throw e;
  }
});

/** A chat change that succeeded but changes nothing in the Reel: its credits (or its free turn) come back, and the phone
 * is told (chat.unchanged), so it says "nothing changed, no credits used". Undo never gives credits back. */
async function noChangeBack(d: DirectIn, res: Parameters<typeof planChanged>[1], charge: Awaited<ReturnType<typeof chatTurn>> | null, out: { chat?: Record<string, unknown> }) {
  if (!charge || !d.chat || planChanged(d, res)) return out;
  await charge.undo();
  return { chat: { ...out.chat, charged: 0, unchanged: true, used: Math.max(0, charge.used - 1), left: charge.free ? charge.left + 1 : charge.left } };
}
