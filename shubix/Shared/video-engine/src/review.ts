/**
 * The edit's own review: after Shubix makes a Reel, it measures the finished edit the way a careful editor would look it
 * over, before a single frame is exported. Every number is measured from the edit itself (the cuts, the beats, the
 * footage each shot shows); nothing is guessed, and what was not measured is `null`, never a made-up value.
 *
 * It reads only the edit: it decodes no media and changes nothing. The website's studio and the Android app's brain
 * both give it their edit in this one shape, so the same Reel gets the same review on both.
 */

export type EditReviewShot = {
  /** where the shot plays in the Reel (seconds) */
  start: number;
  end: number;
  /** which clip, and the part of it this shot shows (seconds of footage) */
  sourceIndex: number;
  sourceStart: number;
  sourceEnd: number;
  /** what the music does at this shot's cut */
  kind?: "drop" | "hit" | "break" | "cut";
  /** sharpness against the clip's own typical sharpness (1 = typical, under 0.45 = soft) */
  sharpness?: number;
  /** average brightness, 0 (black) to 1 */
  brightness?: number;
  /** movement, 0 (still) to 1 (the most movement in these clips) */
  motion?: number;
  /** share of the shot with a face in it, 0 to 1 */
  face?: number;
  /** the effect and the transition into the shot ("none" / "hard" = nothing) */
  effect?: string;
  transition?: string;
  /** chosen by the creator or by an explicit instruction: reviewed like the others, never proposed for a change */
  locked?: boolean;
};

export type EditReviewInput = {
  shots: EditReviewShot[];
  /** the song's beats (seconds). None (a talking Reel, no song): beat checks are skipped, not failed. */
  beats?: number[];
  /** the song's drops (seconds): the moments a cut matters most */
  drops?: number[];
  /** the Reel's length (seconds) */
  duration: number;
  /** how many clips the creator gave, and each one's length when known */
  sourceCount: number;
  sourceDurations?: number[];
  /** a cut within this of a beat is on the beat (default 40 ms: a little over one frame at 30 fps) */
  toleranceMs?: number;
  /** how early cuts are placed before their beat on purpose (the studio cuts one frame early: 1/30) */
  cutLead?: number;
};

export type EditReviewIssueCode =
  | "timeline-gap" | "timeline-overlap" | "timeline-length" | "invalid-shot"
  | "cut-off-beat" | "drop-missed" | "footage-repeated" | "same-clip-jump" | "clips-unused"
  | "soft-shot" | "dark-shot" | "footage-overrun" | "slow-stretch" | "flash-shot" | "long-shot"
  | "weak-hook" | "transition-run" | "effects-everywhere";

export type EditReviewRepair =
  | "rebuild-timeline" | "snap-cut-to-beat" | "cut-on-drop" | "pick-unused-moment" | "pick-another-clip"
  | "use-unused-clip" | "pick-sharper-moment" | "pick-brighter-moment" | "shorten-shot" | "merge-shot"
  | "split-shot" | "stronger-opening" | "vary-transitions" | "fewer-effects";

export type EditReviewIssue = {
  code: EditReviewIssueCode;
  /** error: the Reel is wrong as made. warning: a viewer would notice. note: could be better. */
  severity: "error" | "warning" | "note";
  /** the shot it is about (its place in the Reel), when it is about one */
  shot?: number;
  /** the measured value behind it, in the unit the message names */
  value?: number;
  message: string;
  repair: EditReviewRepair;
  /** false: the shot is locked, so this is said but not proposed for a change */
  repairable: boolean;
};

export type EditReviewMetrics = {
  shots: number;
  duration: number;
  /** cuts measured against the beats (null: no beats, or a single shot) */
  beatSync: { cuts: number; onBeat: number; ratio: number; meanOffsetMs: number; worstOffsetMs: number } | null;
  /** drops with a cut on them (null: the song has no drops in the Reel) */
  drops: { total: number; hit: number; ratio: number } | null;
  /** seconds of footage shown more than once, and its share of all footage shown */
  repeatedFootage: { seconds: number; ratio: number };
  /** cuts from a clip to another part of the same clip, while other clips were there to cut to */
  sameClipJumps: number;
  /** clips used, out of the ones the Reel had room for */
  clipCoverage: { used: number; possible: number; ratio: number };
  /** shots that are soft or dark, out of the shots that were measured (null: none measured) */
  weakShots: { measured: number; soft: number; dark: number; ratio: number } | null;
  /** shots slowed under 0.4x (footage stretched thin) */
  stretchedShots: number;
  shotLength: { shortest: number; longest: number; median: number };
  /** the opening shot against the rest (null: not measured, or a single shot) */
  hook: { strength: number; medianOfRest: number } | null;
};

export type EditReview = {
  version: 1;
  /** pass: nothing a viewer would notice. warn: something would be noticed. fail: the edit is wrong as made. */
  status: "pass" | "warn" | "fail";
  /** 0 to 100: 100 minus what each issue costs (the cost of every code is in COST below) */
  score: number;
  metrics: EditReviewMetrics;
  issues: EditReviewIssue[];
  /** the repairs worth doing, most valuable first (only for shots that may be changed) */
  repairs: EditReviewRepair[];
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, places = 3) => { const k = 10 ** places; return Math.round(v * k) / k; };
const medianOf = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** what one issue of each kind takes from the score, and the most all issues of that kind may take together */
const COST: Record<EditReviewIssueCode, [each: number, most: number]> = {
  "invalid-shot": [40, 40], "timeline-gap": [20, 40], "timeline-overlap": [20, 40], "timeline-length": [20, 20],
  "footage-overrun": [10, 20],
  "cut-off-beat": [2, 20], "drop-missed": [4, 12], "footage-repeated": [3, 15], "same-clip-jump": [3, 12],
  "clips-unused": [6, 6], "soft-shot": [2.5, 10], "dark-shot": [2.5, 10], "slow-stretch": [2, 8],
  "flash-shot": [2, 6], "long-shot": [1.5, 6], "weak-hook": [5, 5], "transition-run": [3, 3], "effects-everywhere": [3, 3],
};
/** the order repairs are proposed in: what breaks the Reel first, then what a viewer notices first */
const REPAIR_ORDER: EditReviewRepair[] = ["rebuild-timeline", "shorten-shot", "cut-on-drop", "snap-cut-to-beat",
  "pick-unused-moment", "pick-another-clip", "stronger-opening", "pick-sharper-moment", "pick-brighter-moment",
  "use-unused-clip", "merge-shot", "split-shot", "vary-transitions", "fewer-effects"];

/** The faults another take of the same edit can change (which moment of which clip each shot shows); the cuts, the
 * transitions and the effects are the same in every take. */
export const EDIT_TAKE_FAULTS: readonly EditReviewIssueCode[] = ["footage-repeated", "same-clip-jump", "soft-shot",
  "dark-shot", "weak-hook", "slow-stretch", "footage-overrun"];
/** Is another take worth making: does this one have a fault a take can change, on a shot that may be changed? */
export const editNeedsAnotherTake = (review: EditReview) =>
  review.issues.some((issue) => issue.repairable && EDIT_TAKE_FAULTS.includes(issue.code));

const SOFT = 0.45, DARK = 0.08, SLOWEST = 0.4, FLASH = 0.2, LONG = 6, EDGE = 0.02;

/** how far `time` is from the nearest of `sorted` (seconds; Infinity with none) */
function nearest(sorted: number[], time: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < time) lo = mid + 1; else hi = mid; }
  let d = Infinity;
  if (lo < sorted.length) d = Math.abs(sorted[lo] - time);
  if (lo > 0) d = Math.min(d, Math.abs(sorted[lo - 1] - time));
  return d;
}

/**
 * Review a finished edit. The shots are taken in the order they play. A shot with a time or a clip that is not a real
 * number makes the review fail at once (the rest could not be measured truthfully).
 */
export function reviewAutonomousEdit(input: EditReviewInput): EditReview {
  const issues: EditReviewIssue[] = [];
  const add = (code: EditReviewIssueCode, severity: EditReviewIssue["severity"], repair: EditReviewRepair, message: string,
    shot?: number, value?: number, locked = false) => {
    issues.push({ code, severity, message, repair, repairable: !locked,
      ...(shot === undefined ? {} : { shot }), ...(value === undefined ? {} : { value: round(value) }) });
  };
  const shots = input.shots ?? [];
  const duration = num(input.duration) && input.duration > 0 ? input.duration : 0;
  const tolerance = (num(input.toleranceMs) && input.toleranceMs > 0 ? input.toleranceMs : 40) / 1000;
  const lead = num(input.cutLead) && input.cutLead >= 0 ? input.cutLead : 0;
  const sourceCount = num(input.sourceCount) && input.sourceCount > 0 ? Math.floor(input.sourceCount) : 0;

  const invalid = shots.findIndex((s) => !s || ![s.start, s.end, s.sourceStart, s.sourceEnd].every(num) ||
    !Number.isInteger(s.sourceIndex) || s.sourceIndex < 0 || s.end <= s.start || s.sourceEnd < s.sourceStart || s.start < 0 || s.sourceStart < 0);
  if (!shots.length || invalid >= 0 || !duration) {
    add("invalid-shot", "error", "rebuild-timeline",
      !shots.length ? "The edit has no shots." : !duration ? "The Reel's length is not known." : `Shot ${invalid + 1} has a time or a clip that is not valid.`,
      invalid >= 0 ? invalid : undefined);
    return finish(issues, {
      shots: shots.length, duration: round(duration), beatSync: null, drops: null, repeatedFootage: { seconds: 0, ratio: 0 },
      sameClipJumps: 0, clipCoverage: { used: 0, possible: 0, ratio: 0 }, weakShots: null, stretchedShots: 0,
      shotLength: { shortest: 0, longest: 0, median: 0 }, hook: null,
    });
  }

  // ---- the timeline holds together: no hole, no two shots at once, as long as the Reel
  for (let i = 1; i < shots.length; i++) {
    const d = shots[i].start - shots[i - 1].end;
    if (d > EDGE) add("timeline-gap", "error", "rebuild-timeline", `Nothing plays for ${round(d, 2)} s before shot ${i + 1}.`, i, d);
    else if (d < -EDGE) add("timeline-overlap", "error", "rebuild-timeline", `Shots ${i} and ${i + 1} play at the same time for ${round(-d, 2)} s.`, i, -d);
  }
  const reelEnd = shots[shots.length - 1].end, lengthOff = Math.abs(reelEnd - duration);
  if (shots[0].start > EDGE || lengthOff > Math.max(0.1, duration * 0.01)) {
    add("timeline-length", "error", "rebuild-timeline",
      shots[0].start > EDGE ? `The Reel starts ${round(shots[0].start, 2)} s late.` : `The shots end at ${round(reelEnd, 2)} s but the Reel is ${round(duration, 2)} s long.`,
      undefined, shots[0].start > EDGE ? shots[0].start : lengthOff);
  }

  // ---- the cuts against the beats (the first shot's start is the start of the Reel, not a cut)
  const beats = [...new Set((input.beats ?? []).filter((b) => num(b) && b >= 0))].sort((a, b) => a - b);
  let beatSync: EditReviewMetrics["beatSync"] = null;
  if (beats.length && shots.length > 1) {
    let onBeat = 0, sum = 0, worst = 0;
    for (let i = 1; i < shots.length; i++) {
      const off = nearest(beats, shots[i].start + lead);
      sum += off; worst = Math.max(worst, off);
      if (off <= tolerance + 1e-9) onBeat++;
      else add("cut-off-beat", "warning", "snap-cut-to-beat", `The cut into shot ${i + 1} is ${Math.round(off * 1000)} ms off the beat.`, i, off * 1000, !!shots[i].locked || !!shots[i - 1].locked);
    }
    const cuts = shots.length - 1;
    beatSync = { cuts, onBeat, ratio: round(onBeat / cuts), meanOffsetMs: round(sum / cuts * 1000, 1), worstOffsetMs: round(worst * 1000, 1) };
  }

  // ---- every drop gets a cut
  const starts = shots.map((s) => s.start + lead);
  const dropTimes = [...new Set((input.drops ?? []).filter((d) => num(d) && d > 0.25 && d < duration - 0.25))].sort((a, b) => a - b);
  let drops: EditReviewMetrics["drops"] = null;
  if (dropTimes.length) {
    let hit = 0;
    for (const d of dropTimes) {
      if (nearest(starts, d) <= tolerance + 1e-9) hit++;
      else add("drop-missed", "warning", "cut-on-drop", `The drop at ${round(d, 2)} s has no cut on it.`, undefined, d);
    }
    drops = { total: dropTimes.length, hit, ratio: round(hit / dropTimes.length) };
  }

  // ---- footage shown twice; a clip cut to another part of itself while other clips were there
  const bySource = new Map<number, Array<[number, number, number]>>();
  let footage = 0, repeated = 0, sameClipJumps = 0;
  shots.forEach((s, i) => {
    const prior = bySource.get(s.sourceIndex) ?? [];
    let ov = 0;
    for (const [a, b] of prior) ov += Math.max(0, Math.min(b, s.sourceEnd) - Math.max(a, s.sourceStart));
    ov = Math.min(ov, s.sourceEnd - s.sourceStart);
    if (ov > 0.05) add("footage-repeated", "warning", "pick-unused-moment", `Shot ${i + 1} shows ${round(ov, 2)} s of footage the Reel already showed.`, i, ov, !!s.locked);
    repeated += ov; footage += s.sourceEnd - s.sourceStart;
    prior.push([s.sourceStart, s.sourceEnd, i]); bySource.set(s.sourceIndex, prior);
    const p = shots[i - 1];
    // the same clip going on where the last shot ended is one take with a cut on the beat, not a jump
    if (p && sourceCount > 1 && p.sourceIndex === s.sourceIndex && Math.abs(s.sourceStart - p.sourceEnd) > 0.15) {
      sameClipJumps++;
      add("same-clip-jump", "warning", "pick-another-clip", `Shots ${i} and ${i + 1} are two parts of the same clip, one after the other.`, i, undefined, !!s.locked);
    }
  });
  const used = bySource.size, possible = Math.min(sourceCount || used, shots.length);
  if (possible > 0 && used < possible) {
    add("clips-unused", "note", "use-unused-clip", `${possible - used} of the creator's ${sourceCount} clips ${possible - used === 1 ? "is" : "are"} not in the Reel.`, undefined, possible - used);
  }

  // ---- what each shot shows: soft, dark, more footage than the clip has, slowed too far, too short, too long
  let measured = 0, soft = 0, dark = 0, stretched = 0;
  const lengths = shots.map((s) => s.end - s.start);
  const multi = shots.length > 1;
  shots.forEach((s, i) => {
    const len = lengths[i], locked = !!s.locked;
    if (num(s.sharpness) || num(s.brightness)) measured++;
    if (num(s.sharpness) && s.sharpness < SOFT) { soft++; add("soft-shot", "warning", "pick-sharper-moment", `Shot ${i + 1} is soft (${round(s.sharpness, 2)} of its clip's usual sharpness).`, i, s.sharpness, locked); }
    if (num(s.brightness) && s.brightness < DARK) { dark++; add("dark-shot", "warning", "pick-brighter-moment", `Shot ${i + 1} is too dark to see (brightness ${round(s.brightness, 2)}).`, i, s.brightness, locked); }
    const clipLen = input.sourceDurations?.[s.sourceIndex];
    if (num(clipLen) && s.sourceEnd > clipLen + 0.05) add("footage-overrun", "error", "shorten-shot", `Shot ${i + 1} needs ${round(s.sourceEnd - clipLen, 2)} s more footage than its clip has.`, i, s.sourceEnd - clipLen, locked);
    const rate = (s.sourceEnd - s.sourceStart) / len;
    // a freeze frame (no footage span at all) is a choice, not a stretch
    if (rate > 0.001 && rate < SLOWEST - 1e-6) { stretched++; add("slow-stretch", "warning", "shorten-shot", `Shot ${i + 1} is slowed to ${round(rate, 2)}x to fill its time.`, i, rate, locked); }
    if (multi && len < FLASH) add("flash-shot", "note", "merge-shot", `Shot ${i + 1} is only ${Math.round(len * 1000)} ms long.`, i, len, locked);
    if (multi && sourceCount > 1 && len > LONG) add("long-shot", "note", "split-shot", `Shot ${i + 1} holds for ${round(len, 1)} s.`, i, len, locked);
  });

  // ---- the opening: the first seconds decide whether people keep watching
  const strength = (s: EditReviewShot) => num(s.motion) || num(s.face) || num(s.sharpness)
    ? 0.5 * Math.min(1, Math.max(0, s.motion ?? 0)) + 0.3 * Math.min(1, Math.max(0, s.face ?? 0)) + 0.2 * Math.min(1, Math.max(0, s.sharpness ?? 0))
    : null;
  let hook: EditReviewMetrics["hook"] = null;
  const first = strength(shots[0]), rest = shots.slice(1).map(strength).filter(num);
  if (first !== null && rest.length >= 2) {
    const med = medianOf(rest);
    hook = { strength: round(first), medianOfRest: round(med) };
    if (first < med * 0.8 - 1e-9) add("weak-hook", "warning", "stronger-opening", "The opening shot is weaker than most of the Reel: less movement, faces or sharpness.", 0, first, !!shots[0].locked);
  }

  // ---- the same transition again and again; an effect on nearly every shot
  let run = 1, longestRun = 1;
  for (let i = 2; i < shots.length; i++) {
    const t = shots[i].transition, same = !!t && t !== "hard" && t === shots[i - 1].transition;
    run = same ? run + 1 : 1; longestRun = Math.max(longestRun, run);
  }
  if (longestRun >= 4) add("transition-run", "note", "vary-transitions", `The same transition comes ${longestRun} times in a row.`, undefined, longestRun);
  const withEffect = shots.filter((s) => !!s.effect && s.effect !== "none").length;
  if (shots.length >= 6 && withEffect / shots.length > 0.8) add("effects-everywhere", "note", "fewer-effects", `${withEffect} of ${shots.length} shots have an effect: none of them stands out.`, undefined, withEffect);

  return finish(issues, {
    shots: shots.length, duration: round(duration), beatSync, drops,
    repeatedFootage: { seconds: round(repeated), ratio: footage > 0 ? round(repeated / footage) : 0 },
    sameClipJumps,
    clipCoverage: { used, possible, ratio: possible ? round(used / possible) : 0 },
    weakShots: measured ? { measured, soft, dark, ratio: round((soft + dark) / measured) } : null,
    stretchedShots: stretched,
    shotLength: { shortest: round(Math.min(...lengths)), longest: round(Math.max(...lengths)), median: round(medianOf(lengths)) },
    hook,
  });
}

function finish(issues: EditReviewIssue[], metrics: EditReviewMetrics): EditReview {
  const taken = new Map<EditReviewIssueCode, number>();
  for (const issue of issues) {
    const [each, most] = COST[issue.code];
    taken.set(issue.code, Math.min(most, (taken.get(issue.code) ?? 0) + each));
  }
  let score = 100;
  for (const v of taken.values()) score -= v;
  const wanted = new Set(issues.filter((i) => i.repairable).map((i) => i.repair));
  return {
    version: 1,
    status: issues.some((i) => i.severity === "error") ? "fail" : issues.some((i) => i.severity === "warning") ? "warn" : "pass",
    score: Math.max(0, Math.round(score * 10) / 10),
    metrics, issues,
    repairs: REPAIR_ORDER.filter((r) => wanted.has(r)),
  };
}

/** The review in one line, for the Reel's log: "92/100 · 14/15 cuts on the beat · 1 soft shot". */
export function describeEditReview(review: EditReview): string {
  const m = review.metrics, parts = [`${review.score}/100`];
  if (m.beatSync) parts.push(`${m.beatSync.onBeat}/${m.beatSync.cuts} cuts on the beat`);
  if (m.drops) parts.push(`${m.drops.hit}/${m.drops.total} drops cut`);
  if (m.repeatedFootage.seconds > 0.05) parts.push(`${m.repeatedFootage.seconds} s shown twice`);
  if (m.weakShots && m.weakShots.soft + m.weakShots.dark > 0) {
    const n = m.weakShots.soft + m.weakShots.dark;
    parts.push(`${n} weak shot${n === 1 ? "" : "s"}`);
  }
  const errors = review.issues.filter((i) => i.severity === "error").length;
  if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
