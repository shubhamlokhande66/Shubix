/* eslint-disable @typescript-eslint/no-require-imports */
// The editing tools in the website's preview, on real clips: a Reel is made (a song, four clips), then a camera zoom by
// keyframes on its longest shot (the frame at the shot's end must change) and a red square photo as a layer with every
// mask shape (its middle stays red, its box's corner does not). Writes tools.json.
//   MEDIA=<folder with song.mp3, c01/c04/c05/c10.mp4; red.png one folder up> OUT=<folder> node tools.cjs
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright'); const path = require('path'); const fs = require('fs');
const M = process.env.MEDIA, out = {};
(async () => {
  const b = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}); const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await ctx.route('**/api/auth/me', (r) => r.fulfill({ json: { authEnabled: false, user: null } }));
  await p.goto((process.env.BASE || 'http://localhost:3001') + '/create/music', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.querySelector('.brs') && document.querySelector('.brs').__studio, null, { timeout: 120000 });
  await p.setInputFiles('#mfile', path.join(M, 'song.mp3'));
  await p.waitForFunction(() => /confirmed|double-checked|^Ready$/.test(document.getElementById('s1st').textContent), null, { timeout: 300000 });
  await p.setInputFiles('#vfile', ['c01', 'c04', 'c05', 'c10'].map((c) => path.join(M, c + '.mp4')));
  await p.waitForFunction(() => { const g = document.getElementById('fgen'); return g && !g.disabled; }, null, { timeout: 600000 });
  await p.evaluate(() => document.getElementById('fgen').click());
  for (let k = 0; k < 120; k++) {
    await p.waitForTimeout(2000);
    await p.evaluate(() => { for (const d of document.querySelectorAll('[role=dialog],[aria-modal=true]')) { const t = d.innerText; const b = [...d.querySelectorAll('button')].find((x) => /^close$/i.test(x.innerText.trim())) || d.querySelector('#cconfok'); if (b && /not answering|longer than your song|picks the best/i.test(t)) b.click(); } });
    if (await p.evaluate(() => { const pl = document.getElementById('play'); return !!pl && !pl.disabled && (document.querySelector('.brs').__studio.edit || []).length > 0; })) break;
  }
  let gen = -1, same = 0; for (let k = 0; k < 60 && same < 4; k++) { const g = await p.evaluate(() => document.querySelector('.brs').__studio.editGen); same = g === gen ? same + 1 : 0; gen = g; await p.waitForTimeout(500); }
  // a frame of the preview, as numbers: mean colour of a box (fractions of the canvas)
  const grab = async (t, boxes) => p.evaluate(async ({ t, boxes }) => {
    const S = document.querySelector('.brs').__studio; await S.kfSeek(t); await new Promise((r) => setTimeout(r, 400)); await S.kfSeek(t); await new Promise((r) => setTimeout(r, 300));
    const c = document.getElementById('out'), g = c.getContext('2d', { willReadFrequently: true }) || null;
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height; const x = tmp.getContext('2d'); x.drawImage(c, 0, 0);
    return boxes.map(([a, b2, w, h]) => { const d = x.getImageData(Math.round(a * c.width), Math.round(b2 * c.height), Math.max(1, Math.round(w * c.width)), Math.max(1, Math.round(h * c.height))).data; let r = 0, gg = 0, bb = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; } return [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)]; });
  }, { t, boxes });
  const edit = await p.evaluate(() => document.querySelector('.brs').__studio.edit.map((e) => [e.start, e.end]));
  out.shots = edit.length;
  // 1. keyframes: the longest shot, no keyframes vs a zoom to 2.5x at its end
  const L = edit.reduce((bi, e, i) => (e[1] - e[0] > edit[bi][1] - edit[bi][0] ? i : bi), 0), [a, z] = edit[L], tEnd = z - 0.1;
  const thumb = async (t) => p.evaluate(async (t) => { const S = document.querySelector('.brs').__studio; await S.kfSeek(t); await new Promise((r) => setTimeout(r, 500)); const c = document.getElementById('out'), m = document.createElement('canvas'); m.width = 32; m.height = 56; m.getContext('2d').drawImage(c, 0, 0, 32, 56); return [...m.getContext('2d').getImageData(0, 0, 32, 56).data].filter((_, i) => i % 4 === 1); }, t);
  const before = await thumb(tEnd);
  await p.evaluate(async ({ a, z }) => { const S = document.querySelector('.brs').__studio; await S.kfSeek(a + 0.05); S.kfSet({ s: 1 }); await S.kfSeek(z - 0.1); S.kfSet({ s: 2.5 }); }, { a, z });
  const after = await thumb(tEnd);
  const diff = (u, v) => Math.round(u.reduce((q, x, i) => q + Math.abs(x - v[i]), 0) / u.length);
  out.keyframes = { shot: L, keys: await p.evaluate((L) => (document.querySelector('.brs').__studio.edit[L].uk || []).length, L), changeAtEnd: diff(before, after) };
  // 2. a layer with a mask: a red square photo, then each mask shape: the middle stays red, its box's corner does not
  await p.evaluate((t) => document.querySelector('.brs').__studio.kfSeek(t), 0.5);
  await p.setInputFiles('#lyfile', path.join(process.env.MEDIA, '..', 'red.png'));
  await p.waitForFunction(() => document.getElementById('lylist').children.length > 0, null, { timeout: 30000 });
  const ly = await p.evaluate(() => { const st = document.querySelector('.brs').__studio.state(); return (st.layers || st.ly || [])[0] || null; });
  out.layer = ly ? { t0: ly.t0, t1: ly.t1, x: ly.x, y: ly.y, s: ly.s } : 'no layer in state';
  if (ly) {
    const t = (ly.t0 + ly.t1) / 2, aspect = await p.evaluate(() => { const c = document.getElementById('out'); return c.width / c.height; });
    const half = ly.s / 2, hy = half * aspect;   // the photo is square: as wide as s of the frame
    const centre = [ly.x - 0.02, ly.y - 0.02, 0.04, 0.04], corner = [ly.x - half + 0.01, ly.y - hy + 0.01, 0.03, 0.03 * aspect];
    out.masks = {};
    for (const m of ['none', 'circle', 'rect', 'heart', 'star', 'triangle', 'diamond', 'hexagon', 'radial', 'line', 'polygon', 'mirror']) {
      const ok = await p.evaluate((m) => { const btn = document.querySelector(`#lymask [data-m="${m}"]`); if (!btn) return false; btn.click(); return true; }, m);
      if (!ok) { out.masks[m] = 'no button'; continue; }
      const [c1, c2] = await grab(t, [centre, corner]);
      const red = (c) => c[0] > 150 && c[1] < 90 && c[2] < 90;
      out.masks[m] = { centreRed: red(c1), cornerRed: red(c2), centre: c1, corner: c2 };
    }
  }
  out.errors = errs;
  fs.writeFileSync(path.join(process.env.OUT, 'tools.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  await b.close();
})().catch((e) => { console.error('FAILED', e.message.slice(0, 500)); process.exit(1); });
