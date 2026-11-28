// Copy a Reel, scored (studio-e2e with ROUNDTRIP=1): each exported Reel was given to Copy a Reel on the same clips and
// the copy measured against the real edit (run.cjs compareEdits). This prints the scores as a table (and adds it to the
// GitHub run's summary page when GITHUB_STEP_SUMMARY is set). Usage: node roundtrip-summary.cjs <e2e output folder>
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('-roundtrip.json')).sort() : [];
const rows = [];
for (const f of files) {
  try { rows.push({ id: f.replace(/-roundtrip\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).score }); }
  catch (e) { rows.push({ id: f, error: String(e.message || e) }); }
}
const cell = (v) => (v === null || v === undefined ? '-' : typeof v === 'number' ? String(v) : String(v));
const parts = ['total', 'cuts', 'transitions', 'effects', 'speed', 'moves', 'look'];
let md = '## Copy a Reel, scored against the real edit\n\n';
if (!rows.length) md += 'No roundtrip results (was the roundtrip switch on, and did the studio run reach the export?).\n';
else {
  md += '| Reel | ' + parts.join(' | ') + ' | shots (real / copy) | what was copied wrong |\n|' + ' --- |'.repeat(parts.length + 3) + '\n';
  for (const r of rows) {
    if (r.error) { md += `| ${r.id} | could not read: ${r.error} |\n`; continue; }
    const wrong = [...(r.transitionsWrong || []), ...Object.entries(r.effectsWrong || {}).map(([k, n]) => `${k} (${n})`)].slice(0, 8).join(', ');
    md += `| ${r.id} | ` + parts.map((k) => cell(r[k])).join(' | ') + ` | ${(r.shots || []).join(' / ')} | ${wrong || '-'} |\n`;
  }
  const ok = rows.filter((r) => !r.error && Number.isFinite(r.total));
  const avg = (k) => { const v = ok.map((r) => r[k]).filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : '-'; };
  md += `\n**${ok.length} Reels: average ${avg('total')}%** (cuts ${avg('cuts')}, transitions ${avg('transitions')}, effects ${avg('effects')}, speed ${avg('speed')}, moves ${avg('moves')}, look ${avg('look')}); `;
  md += `${ok.filter((r) => r.total >= 100).length} at 100%, ${ok.filter((r) => r.total >= 90).length} at 90% or more.\n`;
}
console.log(md);
console.log('ROUNDTRIP_JSON ' + JSON.stringify(rows));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
