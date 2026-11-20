/**
 * The shot list in plain words (agreed with ChatGPT, 2026-11-20: "one true shot plan"). Ask Shubix lists the shots the
 * Reel really shows, made from the finished edit (not the plan Shubix AI asked for, which "In my order" may not follow),
 * in words a first-time editor reads: no file names, no "@4.2s", no symbols.
 */
export type ShotWordsIn = {
  start: number;          // where the shot starts in the Reel, seconds
  type?: string;          // drop | break | hit | cut
  first?: boolean;        // the opening shot
  clip?: number | null;   // the person's clip number, 1-based
  at?: number | null;     // where in that clip the shot starts, seconds
  photo?: boolean;
  what?: string;          // what is in it (Shubix AI's note on the moment)
  transition?: string;    // the transition's name, "" for a plain cut
  effect?: string;        // the effect's name, "" for none
  keys?: string[];        // keyframe moves: punch, shake, flash, pulse…
  move?: boolean;         // a camera move
  speed?: string;         // "" for normal
};

const KEY_WORDS: Record<string, string> = {
  punch: "zoom punch on the beat", shake: "shake on the beat", flash: "flash on the beat", pulse: "pulse on the beat",
  zoom: "zoom on the beat", spin: "spin", blur: "blur on the beat", rgb: "colour split on the beat", glitch: "glitch on the beat",
};
const clock = (t: number) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const clean = (s?: string) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

/** While a Reel is made: the moments Shubix AI really found in the clips, the newest first, at most 3 (only real ones:
 * a clip it said nothing about is not listed). "" while there are none. */
export function momentsFound(found: { clip: number; what?: string }[], most = 3): string {
  const real = found.filter((f) => clean(f.what)).slice(-most).reverse();
  return real.length ? "Moments found · " + real.map((f) => `Clip ${f.clip}: ${clean(f.what).slice(0, 48)}`).join(" · ") : "";
}

/** One shot as a line: "0:07 · Beat drop · Clip 3 from 0:04 — couple under the sparklers · Whip pan · Shake on the beat" */
export function shotWords(s: ShotWordsIn): string {
  const when = s.first ? "Opening" : s.type === "drop" ? "Beat drop" : s.type === "break" ? "Music break" : "";
  const from = s.clip ? `${s.photo ? "Photo" : "Clip"} ${s.clip}${!s.photo && s.at != null ? ` from ${clock(s.at)}` : ""}` : "";
  const what = clean(s.what);
  const style = [clean(s.transition), clean(s.effect), ...[...new Set(s.keys || [])].map((k) => KEY_WORDS[k] || k), s.move ? "slow camera move" : "", clean(s.speed)]
    .filter(Boolean).map((x, i) => (i ? x : x[0].toUpperCase() + x.slice(1)));
  return [clock(s.start), when, from + (what ? ` — ${what}` : ""), ...style].filter(Boolean).join(" · ") || clock(s.start);
}
