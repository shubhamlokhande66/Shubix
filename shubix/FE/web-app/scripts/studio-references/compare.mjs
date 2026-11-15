// A Reel Shubix made, against the reference Reels (references.json): each style number beside the references' middle
// half (25th to 75th percentile), marked when it falls outside. The yardstick for a change to how the edit is cut.
//   node compare.mjs references.json reel.mp4 [reel2.mp4 ...]
import fs from 'node:fs';
import path from 'node:path';
import { measure, STYLE } from './analyze.mjs';

const [refFile, ...files] = process.argv.slice(2);
if (!refFile || !files.length) { console.error('node compare.mjs references.json reel.mp4 ...'); process.exit(1); }
const ref = JSON.parse(fs.readFileSync(refFile, 'utf8')).summary;
// what the edit decides (the song's tempo, the footage's light and the length are given to it, so they only inform)
const EDIT = ['shot', 'shortest', 'longest', 'shotBeats', 'hook', 'hookBeats', 'under05s', 'rateStart', 'rateMiddle', 'rateEnd'];
for (const f of files) {
  const m = measure(f); let ok = 0;
  console.log(`\n${path.basename(f)}: ${m.dur}s, ${m.bpm} BPM, ${m.shots} shots`);
  for (const k of Object.keys(STYLE)) {
    const v = STYLE[k](m), r = ref[k]; if (v == null || !r) continue;
    const inside = v >= r.low && v <= r.high, edit = EDIT.includes(k); if (edit && inside) ok++;
    console.log(`  ${(edit ? (inside ? 'ok ' : 'OFF') : '   ').padEnd(4)}${k.padEnd(11)} ${String(+v.toFixed(3)).padStart(7)}   references ${r.low} .. ${r.high} (median ${r.median})`);
  }
  console.log(`  ${ok} of ${EDIT.length} edit numbers inside the references' middle half`);
}
