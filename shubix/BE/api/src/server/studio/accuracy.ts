import { mainDb } from "../core/db";

/**
 * How often Shubix's own edit is good enough as it is: of the Reels exported in the last days (a Reel the studio made,
 * not one reopened from My Reels), the share the creator exported without changing anything after Shubix made it.
 * The studio says at each export how many changes the creator made since Shubix's edit (its Undo steps: Shubix's plan
 * is where Undo starts), in the Reel's log line "Export started" (reel_logs, kept 30 days). Admin → Overview shows it.
 * This is the number every change to the automatic edit should move up.
 */

export type ExportLine = { changes?: unknown; opened?: unknown; platform?: unknown };
export type KeptSummary = { exported: number; kept: number; share: number | null; medianChanges: number | null; web: number; android: number };

/** the summary of export lines (pure: the tests give their own) */
export function summarizeKept(lines: ExportLine[]): KeptSummary {
  const made = lines.filter((l) => typeof l.changes === "number" && Number.isFinite(l.changes) && l.changes >= 0 && l.opened !== true);
  const changes = made.map((l) => Math.round(l.changes as number)).sort((a, b) => a - b), kept = changes.filter((c) => c === 0).length;
  const mid = changes.length ? (changes.length % 2 ? changes[(changes.length - 1) / 2] : (changes[changes.length / 2 - 1] + changes[changes.length / 2]) / 2) : null;
  return {
    exported: made.length, kept, share: made.length ? +(kept / made.length).toFixed(3) : null, medianChanges: mid,
    web: made.filter((l) => l.platform !== "android").length, android: made.filter((l) => l.platform === "android").length,
  };
}

/** the last `days` days of exports (at most 20,000 of them) */
export async function keptAsMade(days = 30): Promise<KeptSummary> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await (await mainDb()).collection("reel_logs")
    .find({ step: "export", msg: { $regex: "^Export started" }, at: { $gte: since }, "data.changes": { $type: "number" } }, { projection: { "data.changes": 1, "data.opened": 1, "data.platform": 1 } })
    .limit(20_000).toArray();
  return summarizeKept(rows.map((r) => (r.data ?? {}) as ExportLine));
}
