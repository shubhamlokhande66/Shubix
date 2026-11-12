import { mainDb, OWNER } from "./db";

/** The database's indexes, made once when the server starts (instrumentation.ts); making one that is there already
 * does nothing. Without them every look-up by user reads a whole collection; and two sign-ups at the same moment could both get the same email. A failure is logged, never fatal
 * (for example old duplicate emails: the unique index waits until they are cleaned up). */
const INDEXES: [collection: string, keys: Record<string, 1 | -1>, options?: { unique?: boolean; sparse?: boolean; name?: string; expireAfterSeconds?: number }][] = [
  ["users", { email: 1 }, { unique: true, name: "email_unique" }],
  // a sign-up waiting for its emailed code (server/accounts.ts): one per email, gone a day after it was started
  ["signups", { email: 1 }, { unique: true, name: "signup_email_unique" }],
  ["signups", { expiresAt: 1 }, { expireAfterSeconds: 0, name: "signup_expires" }],
  ["users", { username: 1 }, { unique: true, sparse: true, name: "username_unique" }], // @username: unique (older accounts get one on first use)
  ["referrals", { inviterId: 1, rewarded: 1, rewardedAt: -1 }],
  ["coupon_uses", { code: 1, userId: 1 }],
  ["affiliate_earnings", { affiliateId: 1, status: 1 }],
  ["credit_transfers", { from: 1, at: -1 }],
  ["payments", { userId: 1, createdAt: -1 }],
  ["payments", { status: 1, paidAt: -1 }],
  ["credit_ledger", { userId: 1, at: -1 }],
  ["credit_ledger", { ref: 1 }],
  ["studio_reels", { [OWNER]: 1, status: 1, createdAt: -1 }],
  ["studio_reels", { shareToken: 1 }],
  ["presence", { uid: 1, at: -1 }],
  // reviews (server/reviews.ts): one per person per Reel, Home's approved ones, Admin's newest first
  ["reviews", { userId: 1, reelId: 1 }, { unique: true }],
  ["reviews", { status: 1, approvedAt: -1 }],
  ["reviews", { updatedAt: -1 }],
  // one Reel's log (server/reelLogs.ts, Admin → Logs): its lines in order, the latest Reels, gone after 30 days
  ["reel_logs", { reelId: 1, at: 1, seq: 1 }],
  ["reel_logs", { at: -1 }],
  ["reel_logs", { userId: 1, at: -1 }],
  ["reel_logs", { at: 1 }, { expireAfterSeconds: 30 * 86400, name: "reel_logs_ttl" }],
];

export async function ensureIndexes() {
  const d = await mainDb();
  await Promise.all(
    INDEXES.map(([name, keys, options]) =>
      d.collection(name).createIndex(keys, options ?? {}).catch((e: Error) => console.warn(`index on ${name} (${Object.keys(keys).join(", ")}) not made: ${e.message}`)),
    ),
  );
}
