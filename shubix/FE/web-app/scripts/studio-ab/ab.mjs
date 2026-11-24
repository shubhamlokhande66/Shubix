// The blind A/B's rules (ab.html shows it): the pairs, which side each is on, and what the votes say.
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

/** files -> pairs in a mixed order, the new one on each side in half of them. The same for the same person and folder, so
 * a closed page goes on where it was. */
export function plan(files, who) {
  const by = new Map();
  for (const f of files) {
    const m = /^(.*)\.(old|new)\.(mp4|mov|webm)$/i.exec(f.name); if (!m) continue;
    const at = (f.webkitRelativePath || f.name).slice(0, -f.name.length) + m[1];
    by.set(at, { ...by.get(at), [m[2].toLowerCase()]: f });
  }
  const single = [...by].filter(([, p]) => !p.old || !p.new).map(([id]) => id), whole = [...by].filter(([, p]) => p.old && p.new);
  const id = `${who.toLowerCase()}:${hash(whole.map(([n, p]) => `${n}:${p.old.size}:${p.new.size}`).sort().join('|'))}`;
  const mixed = whole.map(([n, p]) => ({ n, p, k: hash(id + n), s: hash(n + id + 'side') })).sort((a, b) => a.k - b.k);
  const left = new Set([...mixed].sort((a, b) => a.s - b.s).slice(0, Math.ceil(mixed.length / 2)).map((x) => x.n));
  return { id, single, pairs: mixed.map(({ n, p }) => (left.has(n) ? { id: n, a: p.new, b: p.old, aIs: 'new' } : { id: n, a: p.old, b: p.new, aIs: 'old' })) };
}
/** the chance of `k` or more wins of `n` when the two are equal */
export function chance(k, n) {
  let p = 0, c = 1;
  for (let i = 0; i <= n; i++) { if (i >= k) p += c; c = c * (n - i) / (i + 1); }
  return p / 2 ** n;
}
/** the new engine passes when at least 30 pairs were judged and it won so often that chance does so under 5% of the
 * time (20 of 30). "No difference" is no win. */
export function verdict(votes) {
  const c = (w) => votes.filter((v) => v.won === w).length, n = votes.length, won = c('new'), p = n ? chance(won, n) : 1, pass = n >= 30 && p < 0.05;
  return { new: won, old: c('old'), tie: c('tie'), n, p, pass, text: n < 30 ? `${n} pairs: too few to decide (30 needed).` : pass ? 'PASS: the new engine is better.' : 'NOT PASSED: not shown to be better.' };
}
