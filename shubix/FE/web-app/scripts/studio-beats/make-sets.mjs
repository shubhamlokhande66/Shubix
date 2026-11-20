// Makes the benchmark's synthetic songs (no copyrighted audio) in a folder outside the repository's tracked files:
//   node make-sets.mjs [out]        out/set1, set2, set3 (clean) and out/deg1, deg2, deg3 (as heard on a phone)
// Needs python 3 with numpy; the phone sets also need ffmpeg (without it they are left out, and said so).
// Then: node bench.mjs --check baseline.json out/set1 out/set2 out/set3 out/deg1 out/deg2 out/deg3
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), out = path.resolve(process.argv[2] || path.join(here, 'out'));
const py = ['python3', 'python'].find((c) => spawnSync(c, ['-c', 'import numpy'], { stdio: 'ignore' }).status === 0);
if(!py){ console.error('python 3 with numpy is needed (pip install numpy)'); process.exit(1); }
const run = (cwd, script, ...args) => { const r = spawnSync(py, [path.join(here, script), ...args], { cwd, stdio: ['ignore', 'ignore', 'inherit'] }); if(r.status !== 0){ console.error(script + ' failed'); process.exit(1); } };
for(const d of ['set1', 'set2', 'set3']) fs.mkdirSync(path.join(out, d), { recursive: true });
run(path.join(out, 'set1'), 'make_set1.py');
fs.copyFileSync(path.join(here, 'make_set1.py'), path.join(out, 'make_set1.py'));   // make_set2.py reads it from where it runs
run(out, 'make_set2.py'); fs.rmSync(path.join(out, 'make_set1.py'));
run(path.join(out, 'set3'), 'make_set3.py');
if(spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) for(const n of [1, 2, 3]) run(out, 'make_degraded.py', 'set' + n, 'deg' + n);
else console.log('ffmpeg not found: the phone sets (deg1-3) were not made');
console.log('made in ' + out + ': ' + fs.readdirSync(out).filter((d) => fs.existsSync(path.join(out, d, 'truth.json'))).join(', '));
