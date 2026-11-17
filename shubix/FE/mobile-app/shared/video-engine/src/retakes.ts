/**
 * Retakes in a talking video: a creator who stumbles stops and says the line again, so the raw talk has the same
 * sentence twice (or a false start, "So today I… So today I want to show you"). An editor keeps the last take. Here a
 * part of the talk (a stretch of speech between pauses) is a retake when one of the next parts, soon after it, says its
 * words again in the same order; the earlier one goes.
 *
 * From the words the captions already have (any language: the letters, marks and digits of every script are compared), so
 * finding them costs nothing more. Careful: a short part needs a near-exact repeat, a part is only compared with the
 * next three within 25 s, the last part is never dropped and at most a third of the talk goes.
 */

export type TalkPart = { t0: number; t1: number };
export type TalkWord = { text: string; start: number; end: number };

/** a word as compared: lower case, its letters, their marks (Hindi vowel signs) and digits only (any script) */
export const wordKey = (w: string) => w.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

/** the longest run of words two lists share in order */
function lcs(a: string[], b: string[]) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { let diag = 0;
    for (let j = 1; j <= b.length; j++) { const up = row[j]; row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1]); diag = up; } }
  return row[b.length];
}

/** the parts (by index) to leave out, and which later part each one was said again in */
export function findRetakes(parts: TalkPart[], words: TalkWord[]): { drop: number[]; againIn: number[] } {
  const said = parts.map((p) => words.filter((w) => { const m = (w.start + w.end) / 2; return m >= p.t0 && m < p.t1; }).map((w) => wordKey(w.text)).filter(Boolean));
  const drop: number[] = [], againIn: number[] = [];
  const total = parts.reduce((t, p) => t + (p.t1 - p.t0), 0); let gone = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    const a = said[i]; if (a.length < 2) continue;
    // a short part must be said again almost word for word; a long one with most of its words
    const need = a.length <= 3 ? 1 : a.length <= 6 ? 0.8 : 0.65;
    for (let j = i + 1; j <= Math.min(parts.length - 1, i + 3) && parts[j].t0 - parts[i].t1 <= 25; j++) {
      const b = said[j]; if (b.length < 2) continue;
      // the later take starts the same way: compared with its opening (as long as the first take, and a little more)
      const share = lcs(a, b.slice(0, Math.ceil(a.length * 1.5) + 1)) / a.length;
      if (share >= need && gone + (parts[i].t1 - parts[i].t0) <= total / 3) { drop.push(i); againIn.push(j); gone += parts[i].t1 - parts[i].t0; break; }
    }
  }
  return { drop, againIn };
}

/** the words once the dropped parts are gone: the kept parts end to end, as the talk is rebuilt (each part's words
 * move with it), so the captions need not be heard again */
export function wordsWithout(parts: TalkPart[], words: TalkWord[], drop: number[]): TalkWord[] {
  const out: TalkWord[] = []; let t = 0;
  parts.forEach((p, i) => {
    if (drop.includes(i)) return;
    const shift = t - p.t0;
    for (const w of words) { const m = (w.start + w.end) / 2; if (m >= p.t0 && m < p.t1) out.push({ ...w, start: Math.max(t, w.start + shift), end: Math.min(t + p.t1 - p.t0, w.end + shift) }); }
    t += p.t1 - p.t0;
  });
  return out;
}
