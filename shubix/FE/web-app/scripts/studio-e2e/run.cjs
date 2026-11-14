/* eslint-disable @typescript-eslint/no-require-imports */
// The studio from start to end in a real browser, as a creator uses it: choose a song, add clips, let Shubix make the
// Reel, play it, export it. What happened is written down (report.json) and the exported file is kept, for analyze.py to
// measure. Nothing here is a guess about the page: a step that cannot be done is reported with what the page showed.
//   BASE=http://localhost:3001 MEDIA=<make-media.mjs out> OUT=<folder> node run.cjs
// PLAYWRIGHT=<path to playwright or playwright-core> and CHANNEL=chrome (the installed Chrome) can be set.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const BASE = process.env.BASE || 'http://localhost:3001';
const MEDIA = path.resolve(process.env.MEDIA || 'media'), OUT = path.resolve(process.env.OUT || 'e2e-out');
const media = JSON.parse(fs.readFileSync(path.join(MEDIA, 'media.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

// what each run is: the song, which clips, and why it is here
const SCENARIOS = [
  { id: 'A-12clips-fourfloor', song: 'four_floor_124', clips: media.clips.map((c) => c.index), why: '12 clips, a steady 124 BPM song: every clip in the Reel, cuts on the beat' },
  { id: 'B-5clips-bhangra', song: 'bhangra_dhol_98', clips: [0, 3, 5, 8, 10], why: '5 clips (one half dark), bhangra: little footage, the dark part kept out' },
].filter((s) => !process.env.ONLY || s.id.startsWith(process.env.ONLY));

const now = () => Date.now();
const studio = () => document.querySelector('.brs');

async function scenario(browser, sc) {
  const rep = { id: sc.id, why: sc.why, song: sc.song, popups: [], steps: [], errors: [], consoleErrors: [], failedRequests: 0, ok: false };
  const step = (name, data) => { rep.steps.push({ name, ...data }); console.log(`[${sc.id}] ${name}`, data ? JSON.stringify(data).slice(0, 600) : ''); };
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => rep.errors.push(String(e.message).slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error' && rep.consoleErrors.length < 40) rep.consoleErrors.push(m.text().slice(0, 200)); });
  p.on('requestfailed', () => { rep.failedRequests++; });
  await p.addInitScript(() => {
    window.__long = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* no long task timing here */ }
  });
  const shot = async (name) => { try { const buf = await p.screenshot({ type: 'jpeg', quality: 38 }); fs.writeFileSync(path.join(OUT, `${sc.id}-${name}.jpg`), buf);
    if (process.env.SHOTS_IN_LOG !== '0') console.log(`SHOT ${sc.id}-${name} ${buf.toString('base64')} END`); } catch (e) { /* the page is gone */ } };
  // what the page shows now, in words: the statuses, the open popups and their buttons, the buttons that can be pressed
  const see = async (name) => { try { const v = await p.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
      const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim().slice(0, 120) : null; };
      const dialogs = [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')].filter(vis).map((d) => ({ id: d.id || null, text: d.innerText.replace(/\s+/g, ' ').slice(0, 260), buttons: [...d.querySelectorAll('button,a[href]')].filter(vis).map((b) => (b.id ? '#' + b.id + ' ' : '') + b.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)) }));
      const buttons = [...document.querySelectorAll('button')].filter((b) => vis(b) && !b.disabled).map((b) => (b.id ? '#' + b.id + ' ' : '') + b.innerText.replace(/\s+/g, ' ').trim().slice(0, 30)).slice(0, 60);
      return { url: location.pathname + location.search, s1st: txt('s1st'), s3st: txt('s3st'), qinfo: txt('qinfo'), fgent: txt('fgent'), freadys: txt('freadys'), xmsg: txt('xmsg'), dialogs, buttons };
    }); console.log(`[${sc.id}] SEE ${name} ` + JSON.stringify(v)); return v; } catch (e) { console.log(`[${sc.id}] SEE ${name} failed: ` + e.message); return null; } };
  const long = async () => p.evaluate(() => { const l = window.__long.splice(0); return { blocks: l.length, longestMs: Math.max(0, ...l), over200: l.filter((x) => x > 200).length, totalMs: l.reduce((a, b) => a + b, 0) }; });
  // The popups a creator answers on the way, answered as one would: the server is not there in this check ("Shubix is
  // not answering": Close), and with more clips than song Shubix is let to pick ("Shubix picks the best 30 s"). Every
  // popup answered is written down; one this does not know is left open and said.
  const answered = [];
  const settle = async (rounds = 6) => {
    for (let k = 0; k < rounds; k++) {
      const did = await p.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
        for (const d of [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')].filter(vis)) {
          const text = d.innerText.replace(/\s+/g, ' ').slice(0, 160);
          if (/not answering right now/i.test(text)) { const b = [...d.querySelectorAll('button')].find((x) => /^close$/i.test(x.innerText.trim())); if (b) { b.click(); return 'Close · ' + text.slice(0, 60); } }
          const ok = d.querySelector('#cconfok'); if (ok && vis(ok)) { const t = ok.innerText.trim(); ok.click(); return t + ' · ' + text.slice(0, 60); }
        }
        return null;
      });
      if (!did) return;
      answered.push(did); console.log(`[${sc.id}]   popup answered: ${did}`);
      await p.waitForTimeout(700);
    }
  };
  const openDialogs = () => p.evaluate(() => [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }).map((d) => d.innerText.replace(/\s+/g, ' ').slice(0, 120)));
  try {
    // ---- 1. the studio opens
    let t0 = now();
    // no API runs behind this website: the one thing the Create flow must know from it is that nobody has to sign in
    await ctx.route('**/api/auth/me', (route) => route.fulfill({ json: { authEnabled: false, user: null } }));
    await p.goto(BASE + (process.env.STUDIO_PATH || '/create/music'), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => document.querySelector('.brs') && document.querySelector('.brs').__studio, null, { timeout: 120000 });
    step('studio open', { ms: now() - t0, ...(await long()) });
    await see('open'); await shot('open');

    // ---- 2. the song: read, its beats found
    const song = media.songs.find((s) => s.name === sc.song);
    t0 = now();
    await p.setInputFiles('#mfile', path.join(MEDIA, song.file));
    await p.waitForFunction(() => /confirmed|double-checked|^Ready$/.test(document.getElementById('s1st').textContent), null, { timeout: 300000 });
    const songInfo = await p.evaluate(() => { const S = document.querySelector('.brs').__studio, r = S.songR || {}, x = S.section || {};
      return { status: document.getElementById('s1st').textContent, bpm: r.period ? +(60 / r.period).toFixed(1) : null, beatSource: r.beatSource || null, beats: (S.beats || []).length,
        section: { start: x.start, len: x.len, whole: x.whole, auto: x.auto } }; });
    step('song ready', { ms: now() - t0, ...songInfo, ...(await long()) });
    await see('song');

    // ---- 3. the clips: read, and the Reel made by itself
    const files = sc.clips.map((i) => path.join(MEDIA, media.clips[i].file));
    t0 = now();
    await p.setInputFiles('#vfile', files);
    // the Create flow: Generate Reel comes on when the song, the beats and the clips are read; pressing it opens the Reel
    await p.waitForFunction(() => { const g = document.getElementById('fgen'); return g && !g.disabled && /Generate/i.test(g.innerText); }, null, { timeout: 600000 });
    const readMs = now() - t0;
    step('clips read', { ms: readMs, ...(await long()) });
    await see('before-generate'); await shot('before-generate');
    await p.click('#fgen');
    // what comes after Generate is watched and said, popup by popup, until the Reel can be played
    const tGen = now(); let opened = false;
    for (let k = 0; k < 150 && !opened; k++) {
      await p.waitForTimeout(2000); await settle();
      opened = (await openDialogs()).filter((t) => !/Crafting your Reel/.test(t)).length === 0 && await p.evaluate(() => { const pl = document.getElementById('play'), r = pl && pl.getBoundingClientRect(); return !!pl && !pl.disabled && r.width > 0 && r.height > 0 && (document.querySelector('.brs').__studio.edit || []).length > 0; });
      if (!opened && (k < 6 || k % 10 === 0)) { const v = await see('after-generate-' + (k * 2) + 's'); if (k === 2 || (v && v.dialogs.length && k < 12)) await shot('after-generate-' + (k * 2) + 's'); }
    }
    if (!opened) { await see('reel-not-opened'); throw new Error('the Reel did not open within 5 minutes of Generate'); }
    const editMs = readMs + (now() - tGen);
    step('reel opened', { msAfterGenerate: now() - tGen, popups: answered.slice() });
    await see('reel-opened'); await shot('reel-opened');
    // the neural beat check and the reading of the clips can remake the edit once more: wait until it has stopped changing
    let gen = -1, same = 0;
    for (let k = 0; k < 60 && same < 4; k++) { const g = await p.evaluate(() => document.querySelector('.brs').__studio.editGen); same = g === gen ? same + 1 : 0; gen = g; await p.waitForTimeout(500); }
    const made = await p.evaluate(() => {
      const root = document.querySelector('.brs'), S = root.__studio, e = S.edit || [], x = S.section || {};
      const srcs = (S.sources || []).map((s) => ({ name: s.name, dur: s.dur, samples: (s.samples || []).length }));
      return { status: document.getElementById('s3st').textContent, sources: srcs,
        section: { start: x.start, len: x.len }, songStatus: document.getElementById('s1st').textContent, beatSource: (S.songR || {}).beatSource || null,
        beats: (S.beats || []).map((b) => +b.toFixed(4)),
        edit: e.map((s) => ({ start: +s.start.toFixed(4), end: +s.end.toFixed(4), src: s.src, in: +(+s.in).toFixed(3), need: +(s.sp.pos(s.end - s.start) * (s.scaleR || 1)).toFixed(3), type: s.type, tr: s.tr || 'hard', efx: s.efx || 'none' })),
        review: root.__lastEditReview || null };
    });
    step('reel made', { ms: editMs, shots: made.edit.length, status: made.status, clipsUsed: new Set(made.edit.map((s) => s.src)).size, clipsGiven: files.length,
      review: made.review ? { score: made.review.score, status: made.review.status, beatSync: made.review.metrics.beatSync, drops: made.review.metrics.drops, issues: made.review.issues.map((i) => i.code + (i.shot === undefined ? '' : '@' + i.shot)) } : null, ...(await long()) });
    rep.made = made;
    await shot('made');

    // ---- 4. the preview plays: how far it gets in 5 seconds, and how evenly the screen was drawn
    await settle();
    await p.click('#play', { timeout: 15000 });
    const play = await p.evaluate(async () => {
      const S = document.querySelector('.brs').__studio, gaps = []; let last = performance.now(), on = true;
      const tick = (t) => { gaps.push(t - last); last = t; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      const t0 = performance.now(); while (!S.playing && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50));
      const startMs = Math.round(performance.now() - t0), a = S.now, w0 = performance.now(); gaps.length = 0;
      await new Promise((r) => setTimeout(r, 5000));
      const b = S.now, wall = (performance.now() - w0) / 1000; on = false;
      const g = gaps.slice().sort((x, y) => x - y);
      return { started: S.playing, startMs, reelSeconds: +(b - a).toFixed(2), wallSeconds: +wall.toFixed(2), frames: gaps.length, fps: +(gaps.length / wall).toFixed(1),
        medianGapMs: g.length ? +g[g.length >> 1].toFixed(1) : null, worstGapMs: g.length ? +g[g.length - 1].toFixed(0) : null, over100ms: gaps.filter((x) => x > 100).length };
    });
    await p.evaluate(() => document.querySelector('.brs').__studio.stopPreview && document.querySelector('.brs').__studio.stopPreview());
    step('preview played', { ...play, ...(await long()) });

    // ---- 5. export, and the file kept
    await p.waitForTimeout(500);
    t0 = now();
    await settle(); await see('before-export');
    // the editor's own Export (the top bar's on a computer; the studio's where that one is not shown)
    { const which = await p.evaluate(() => ['topexport', 'export'].find((id) => { const el = document.getElementById(id), r = el && el.getBoundingClientRect(); return el && !el.disabled && r.width > 0 && r.height > 0; }) || null);
      if (!which) throw new Error('no Export button can be pressed');
      await p.click('#' + which, { timeout: 15000 }); }
    await p.waitForTimeout(1500); await see('export-sheet'); await shot('export-sheet');
    await p.waitForSelector('#xgo', { state: 'visible', timeout: 30000 });
    await p.click('#xgo');
    let lastMsg = '';
    const done = await (async () => {
      const until = now() + 25 * 60000;
      while (now() < until) {
        const s = await p.evaluate(() => { const a = document.getElementById('dlvid'), m = document.getElementById('xmsg');
          return { href: a ? a.getAttribute('href') || '' : '', name: a ? a.getAttribute('download') || '' : '', msg: m && !m.hidden ? m.textContent : '', err: m ? m.classList.contains('err') : false }; });
        if (s.msg && s.msg !== lastMsg && !/^Exporting/.test(s.msg)) console.log(`[${sc.id}]   says: ${s.msg}`);
        if (s.msg) lastMsg = s.msg;
        if (s.href.startsWith('blob:')) return s;
        await settle(2);
        if (s.err) return { failed: s.msg };
        await p.waitForTimeout(1000);
      }
      return { failed: 'no exported file after 25 minutes; the last message: ' + lastMsg };
    })();
    if (done.failed) { step('export FAILED', { ms: now() - t0, said: done.failed }); throw new Error('export: ' + done.failed); }
    const exp = await p.evaluate(async () => {
      const a = document.getElementById('dlvid'), blob = await (await fetch(a.href)).blob(), buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { type: blob.type, size: blob.size, name: a.getAttribute('download') || '', b64: btoa(s), quality: document.querySelector('.brs').__lastQualityReport || null };
    });
    const ext = /webm/.test(exp.type) ? 'webm' : 'mp4', file = `${sc.id}.${ext}`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(exp.b64, 'base64'));
    rep.exported = { file, type: exp.type, bytes: exp.size, name: exp.name, quality: exp.quality };
    step('exported', { ms: now() - t0, file, type: exp.type, mb: +(exp.size / 1048576).toFixed(2), quality: exp.quality ? { status: exp.quality.status, score: exp.quality.score, issues: (exp.quality.issues || []).map((i) => i.code || i) } : null, ...(await long()) });
    await shot('exported');
    rep.ok = true;
    rep.popups = answered;
  } catch (e) {
    rep.failure = String(e && e.message || e).slice(0, 500);
    console.log(`[${sc.id}] FAILED: ${rep.failure}`);
    await see('failure'); await shot('failure');
    try { rep.pageText = (await p.evaluate(() => document.body.innerText)).slice(0, 1500); } catch (e2) { /* the page is gone */ }
  }
  await ctx.close();
  return rep;
}

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
    args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = { base: BASE, browser: browser.version(), at: new Date().toISOString(), media: { clips: media.clips, songs: media.songs.map((s) => ({ name: s.name, file: s.file, beats: s.beats })) }, scenarios: [] };
  for (const sc of SCENARIOS) report.scenarios.push(await scenario(browser, sc));
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('REPORT ' + JSON.stringify({ ...report, media: undefined, scenarios: report.scenarios.map((s) => ({ ...s, made: s.made ? { ...s.made, beats: undefined, edit: s.made.edit.length + ' shots', review: undefined } : undefined })) }));
  console.log('report: ' + path.join(OUT, 'report.json'), '·', report.scenarios.map((s) => s.id + (s.ok ? ' ok' : ' FAILED')).join(', '));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
