/**
 * The effect budget: how much a Reel may do, shot by shot, so it looks edited by a pro and not by a random generator.
 * Agreed with ChatGPT for Shubix (2026-11-20), after a real phone Reel where Shubix AI put a flash, a shake or an RGB
 * split on 5 shots of 6 and called the Reel "devotional":
 *  - a normal shot gets a transition OR one thing inside it (an effect, a keyframe, a camera move), not both
 *  - a hero shot (the song's first drop, or the bass back after a real break; at most one in 10 s) gets up to 3
 *  - the hook (the first shot) opens on a plain cut with at most one thing inside it, and is not a hero
 *  - in any 10 s: at most 2 flashy transitions (2.5 s apart at least), 2 strong things inside shots, 3 in all
 *  - 30 to 40% of the shots are plain
 *  - a calm, sad or devotional Reel has no shake, flash, RGB or glitch where its song is quiet (loudness under 0.5)
 *  - what the creator asked for in their own words is never taken away: "more transitions" lifts the transition
 *    limits, "flash" the flash limits, and a tool they name is never banned or removed
 * Over budget, what goes first: the weakest keyframes (the strongest one on the beat stays), then the effect, then the
 * camera move; the transition goes last (it carries the change in the song).
 *
 * It reads and returns plain data, so the website's studio and the Android app's brain budget a Reel alike, and every
 * change it makes is listed (rule, shot, before, after, why) for the Reel's log.
 */

export type BudgetKey = { at: number; do: string };
export type BudgetShot = {
  /** where the shot plays (seconds) */
  start: number;
  end: number;
  /** what the music does at its cut */
  type?: "drop" | "hit" | "break" | "cut" | string;
  /** the transition into it ("hard" or "" = a plain cut), its effect ("none" or "" = none), keyframes inside it,
   * and whether the camera moves inside it */
  tr?: string;
  fx?: string;
  keys?: BudgetKey[];
  move?: boolean;
  /** the song's loudness under the shot, 0 to 1 for this song (null: not measured) */
  loud?: number | null;
};

export type BudgetLift = {
  /** the creator asked for transitions ("more transitions", "a transition on every clip") */
  transitions?: boolean;
  /** the creator asked for flashes */
  flash?: boolean;
  /** tools the creator named (transition, effect or keyframe names): never banned, never removed */
  named?: string[];
};

export type BudgetOptions = {
  /** the feel of the Reel in words (Shubix AI's story, the template's kind): a calm, sad or devotional one bans the
   * loud tools where the song is quiet */
  mood?: string;
  lift?: BudgetLift;
};

export type BudgetChange = { rule: BudgetRule; shot: number; from: string; to: string; why: string };
export type BudgetRule = "hook" | "mood" | "shot-budget" | "flashy-transitions" | "transition-gap" | "strong-effects"
  | "impact-total" | "plain-shots";
export type BudgetResult = { shots: BudgetShot[]; changes: BudgetChange[]; heroes: number[] };

/** transitions that stand out (light, blur, glitch, a turn): the ones counted against the flashy limits */
export const FLASHY_TRANSITIONS = new Set(["flash", "whip", "zoom", "glitch", "spin", "zoomblur", "dipwhite", "chroma",
  "shake", "pixelate", "burn", "ripple", "dropin", "cube", "cubeup", "flip3d", "swing", "rotatein", "squeeze", "flip", "tiles", "noise"]);
/** effects inside a shot that hit hard */
export const STRONG_EFFECTS = new Set(["shake", "zoomburst", "hook", "snap", "strobe", "rgbpulse", "glitchfx", "chromatic",
  "negative", "radialblur", "fisheye", "swirl", "zoom3d", "blurpulse", "kaleido"]);
/** keyframes that hit hard (a punch is an ordinary accent, a pulse a light one) */
export const STRONG_KEYS = new Set(["flash", "shake"]);
const KEY_RANK: Record<string, number> = { flash: 4, shake: 3, punch: 2, pulse: 1 };
/** what a calm, sad or devotional Reel does not use where its song is quiet */
const CALM_BANNED_TR = new Set(["flash", "whip", "glitch", "chroma", "shake", "zoomblur", "dipwhite", "spin", "pixelate", "noise", "tiles"]);
const CALM_BANNED_FX = new Set(["shake", "zoomburst", "hook", "strobe", "rgbpulse", "glitchfx", "chromatic", "snap", "negative"]);
const CALM_MOOD = /devotion|bhakti|bhajan|aarti|prayer|spiritual|sad|heartbreak|grief|calm|peace|serene|soothing|emotional|melanchol|nostalg|lofi|lo-fi/i;

export const BUDGET = { normal: 1, hero: 3, hook: 1, heroEvery: 10, window: 10, flashyTr: 2, trGap: 2.5, strongIn: 2, impact: 3, plain: 0.3, quiet: 0.5 } as const;

const plainTr = (tr?: string) => !tr || tr === "hard" || tr === "fadein";
const noFx = (fx?: string) => !fx || fx === "none";

/** does a mood (in words) ask for a calm Reel */
export const calmMood = (mood?: string) => !!mood && CALM_MOOD.test(mood);

/** The creator's words (any language, the common ways to write them): what they asked for, for the budget to keep. */
export function budgetLiftFrom(words: string): BudgetLift {
  const w = String(words || "").toLowerCase();
  const named: string[] = [];
  const has = (re: RegExp) => re.test(w);
  if (has(/shake|शेक|हिला/)) named.push("shake");
  if (has(/glitch|ग्लिच/)) named.push("glitch", "glitchfx");
  if (has(/rgb|chroma|colou?r split/)) named.push("rgbpulse", "chroma", "chromatic", "zoomburst", "hook");
  if (has(/strobe|स्ट्रोब/)) named.push("strobe");
  if (has(/whip|व्हिप/)) named.push("whip");
  if (has(/zoom|ज़ूम|झूम|जूम/)) named.push("zoom", "zoomburst", "punch", "zoomblur");
  if (has(/spin|स्पिन/)) named.push("spin");
  const flash = has(/flash|फ्लैश|फ्लॅश|फ़्लैश/);
  if (flash) named.push("flash", "dipwhite");
  return { transitions: has(/transition|ट्रांज़?िशन|ट्रान्झिशन|ट्रान्जिशन/), flash, named };
}

/** at most `cap` of `times` (with t) in any `win` seconds */
function fits(times: number[], t: number, cap: number, win: number) {
  const all = [...times, t].sort((a, b) => a - b);
  for (let i = 0; i < all.length; i++) {
    let n = 0;
    for (let j = i; j < all.length && all[j] - all[i] < win - 1e-6; j++) n++;
    if (n > cap) return false;
  }
  return true;
}

/** The Reel's shots with the budget kept, and every change made (nothing is changed on a Reel already within it). */
export function budgetEffects(input: BudgetShot[], options: BudgetOptions = {}): BudgetResult {
  const shots = input.map((s) => ({ ...s, keys: (s.keys || []).map((k) => ({ ...k })) }));
  const changes: BudgetChange[] = [];
  const lift = options.lift || {}, named = new Set((lift.named || []).map((x) => x.toLowerCase()));
  const kept = (tool?: string) => !!tool && named.has(tool.toLowerCase());
  const trFree = (tr?: string) => kept(tr) || !!lift.transitions || (tr === "flash" && !!lift.flash);
  const note = (rule: BudgetRule, shot: number, from: string, to: string, why: string) => changes.push({ rule, shot, from, to, why });
  const keyWord = (k: BudgetKey[]) => k.length ? k.map((x) => x.do).join("+") : "none";

  // heroes: the song's first drop, and the bass back after a real break; one in any 10 s
  const heroes: number[] = [];
  let drops = 0, brokeAt = -1e9, lastDrop = -1e9, lastHero = -1e9;
  shots.forEach((s, i) => {
    if (s.type === "break") brokeAt = s.start;
    if (s.type !== "drop") return;
    drops++;
    const major = drops === 1 || brokeAt > lastDrop;
    lastDrop = s.start;
    if (i > 0 && major && s.start - lastHero >= BUDGET.heroEvery) { heroes.push(i); lastHero = s.start; }
  });
  const isHero = (i: number) => heroes.includes(i);

  // 1) the hook opens on a plain cut
  if (shots.length && !plainTr(shots[0].tr) && !kept(shots[0].tr)) { note("hook", 0, shots[0].tr || "", "hard", "the first shot opens on a plain cut"); shots[0].tr = "hard"; }

  // 2) a calm Reel where its song is quiet: none of the loud tools
  if (calmMood(options.mood)) shots.forEach((s, i) => {
    if (s.loud != null && s.loud >= BUDGET.quiet) return;
    const why = "a calm Reel on a quiet part of the song";
    if (s.tr && CALM_BANNED_TR.has(s.tr) && !kept(s.tr) && !(s.tr === "flash" && lift.flash)) { note("mood", i, s.tr, "dissolve", why); s.tr = "dissolve"; }
    if (s.fx && CALM_BANNED_FX.has(s.fx) && !kept(s.fx)) { note("mood", i, s.fx, "none", why); s.fx = "none"; }
    const before = s.keys!.length;
    s.keys = s.keys!.filter((k) => !STRONG_KEYS.has(k.do) || kept(k.do));
    if (s.keys.length < before) note("mood", i, "keyframes", keyWord(s.keys), why);
  });

  // 3) the limits over time, before each shot's own budget (a transition the shot keeps must be one the Reel can
  // have): heroes first, then the others in order. One strong thing inside a shot at most, and never the same twice
  // (a shake effect and a shake key are one shake): three loud versions of one hit are not a hero, they are noise
  const trTimes: number[] = [], strongTimes: number[] = [], allTimes: number[] = [];
  const order = [...heroes, ...shots.map((_, i) => i).filter((i) => !isHero(i))];
  for (const i of order) {
    const s = shots[i];
    if (s.tr && FLASHY_TRANSITIONS.has(s.tr)) {
      const free = trFree(s.tr);
      const gapOk = free || trTimes.every((t) => Math.abs(t - s.start) >= BUDGET.trGap - 1e-6);
      if (!free && !fits(trTimes, s.start, BUDGET.flashyTr, BUDGET.window)) { note("flashy-transitions", i, s.tr, "hard", "two flashy transitions in 10 s at most"); s.tr = "hard"; }
      else if (!gapOk) { note("transition-gap", i, s.tr, "hard", "flashy transitions 2.5 s apart at least"); s.tr = "hard"; }
      else if (!free && !fits(allTimes, s.start, BUDGET.impact, BUDGET.window)) { note("impact-total", i, s.tr, "hard", "three loud moments in 10 s at most"); s.tr = "hard"; }
      else { trTimes.push(s.start); allTimes.push(s.start); }
    }
    let strongHere = 0;
    if (s.fx && STRONG_EFFECTS.has(s.fx)) {
      if (kept(s.fx)) { strongTimes.push(s.start); allTimes.push(s.start); strongHere++; }
      else if (!fits(strongTimes, s.start, BUDGET.strongIn, BUDGET.window)) { note("strong-effects", i, s.fx, "none", "two strong effects inside shots in 10 s at most"); s.fx = "none"; }
      else if (!fits(allTimes, s.start, BUDGET.impact, BUDGET.window)) { note("impact-total", i, s.fx, "none", "three loud moments in 10 s at most"); s.fx = "none"; }
      else { strongTimes.push(s.start); allTimes.push(s.start); strongHere++; }
    }
    const keep: BudgetKey[] = [];
    for (const k of s.keys!) {
      const t = s.start + k.at;
      if (!STRONG_KEYS.has(k.do) || kept(k.do)) { keep.push(k); continue; }
      if (strongHere || (s.fx === k.do)) { note("strong-effects", i, k.do, "none", "one strong thing inside a shot"); continue; }
      if (!fits(strongTimes, t, BUDGET.strongIn, BUDGET.window)) { note("strong-effects", i, k.do, "none", "two strong effects inside shots in 10 s at most"); continue; }
      if (!fits(allTimes, t, BUDGET.impact, BUDGET.window)) { note("impact-total", i, k.do, "none", "three loud moments in 10 s at most"); continue; }
      strongTimes.push(t); allTimes.push(t); keep.push(k); strongHere++;
    }
    s.keys = keep;
  }

  // 4) each shot's own budget: keyframes (the strongest stays), then the effect, then the move; the transition last
  const units = (s: BudgetShot) => (!plainTr(s.tr) && !trFree(s.tr) ? 1 : 0) + (noFx(s.fx) ? 0 : 1) + (s.keys!.length ? 1 : 0) + (s.move ? 1 : 0);
  shots.forEach((s, i) => {
    const most = i === 0 ? BUDGET.hook : isHero(i) ? BUDGET.hero : BUDGET.normal, why = i === 0 ? "the hook: one thing inside it" : isHero(i) ? "a hero shot: three at most" : "a normal shot: a transition or one thing inside it";
    if (s.keys!.length > 1 && !isHero(i)) {
      const best = [...s.keys!].sort((a, b) => (KEY_RANK[b.do] || 0) - (KEY_RANK[a.do] || 0))[0];
      const keep = s.keys!.filter((k) => k === best || kept(k.do));
      if (keep.length < s.keys!.length) { note("shot-budget", i, keyWord(s.keys!), keyWord(keep), why); s.keys = keep; }
    }
    if (units(s) > most && s.keys!.length && !s.keys!.some((k) => kept(k.do))) { note("shot-budget", i, keyWord(s.keys!), "none", why); s.keys = []; }
    if (units(s) > most && !noFx(s.fx) && !kept(s.fx)) { note("shot-budget", i, s.fx!, "none", why); s.fx = "none"; }
    if (units(s) > most && s.move) { note("shot-budget", i, "camera move", "none", why); s.move = false; }
    if (units(s) > most && !plainTr(s.tr) && !trFree(s.tr)) { note("shot-budget", i, s.tr!, "hard", why); s.tr = "hard"; }
  });

  // 5) plain shots: 30% at least. Shots on a plain cut lose what is inside them: plain cuts first, then hits, the
  // shortest first (the hook and the heroes keep theirs, and so does anything the creator named)
  const plain = (s: BudgetShot) => plainTr(s.tr) && noFx(s.fx) && !s.keys!.length && !s.move;
  const want = Math.ceil(BUDGET.plain * shots.length) - shots.filter(plain).length;
  if (want > 0) {
    const pr: Record<string, number> = { cut: 0, hit: 1, break: 2, drop: 3 };
    const can = shots.map((s, i) => i).filter((i) => i > 0 && !isHero(i) && !plain(shots[i]) && plainTr(shots[i].tr)
      && !kept(shots[i].fx) && !shots[i].keys!.some((k) => kept(k.do)))
      .sort((a, b) => (pr[shots[a].type || "cut"] ?? 0) - (pr[shots[b].type || "cut"] ?? 0) || (shots[a].end - shots[a].start) - (shots[b].end - shots[b].start) || a - b)
      .slice(0, want);
    for (const i of can) {
      const s = shots[i], was = [noFx(s.fx) ? "" : s.fx, s.keys!.length ? keyWord(s.keys!) : "", s.move ? "camera move" : ""].filter(Boolean).join(" + ");
      s.fx = "none"; s.keys = []; s.move = false;
      note("plain-shots", i, was, "plain", "30% of the shots plain");
    }
  }
  return { shots, changes, heroes };
}

/** a short line of what the budget changed, for the Reel's history ("" when nothing) */
export function describeBudget(changes: BudgetChange[]): string {
  if (!changes.length) return "";
  const by = new Map<BudgetRule, number>();
  changes.forEach((c) => by.set(c.rule, (by.get(c.rule) || 0) + 1));
  const words: Record<BudgetRule, string> = { hook: "the hook opens on a plain cut", mood: "loud tools off the calm parts",
    "shot-budget": "one thing per normal shot", "flashy-transitions": "flashy transitions spaced", "transition-gap": "flashy transitions spaced",
    "strong-effects": "strong effects spaced", "impact-total": "loud moments spaced", "plain-shots": "some shots left plain" };
  const said = [...new Set([...by.keys()].map((k) => words[k]))];
  return said.join(", ");
}
