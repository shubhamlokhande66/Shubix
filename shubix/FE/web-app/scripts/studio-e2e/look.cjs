/* eslint-disable @typescript-eslint/no-require-imports */
// A look at the phone screens of the Create flow, screen by screen (ONLY=look in the start-to-end job): what each
// screen shows (a picture in the log), which buttons are on it and whether a tap on each one reaches it (a button under
// another thing, off the screen or with no size is named), and what is gone from Adjust Music when it is opened again.
//   BASE=http://localhost:3001 MEDIA=<make-media.mjs out> OUT=<folder> ONLY=look node run.cjs
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3001';
const MEDIA = path.resolve(process.env.MEDIA || 'media'), OUT = path.resolve(process.env.OUT || 'e2e-out');
const media = JSON.parse(fs.readFileSync(path.join(MEDIA, 'media.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1.5,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };

// what is on the screen: every button and link with its place, and whether a tap in its middle reaches it
const lookAt = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.05; };
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''));
  const W = innerWidth, H = innerHeight, out = [];
  for (const b of document.querySelectorAll('button, a[href], [role=button], input[type=range], select')) {
    if (!vis(b)) continue;
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, faults = [];
    if (r.left < -1 || r.right > W + 1) faults.push('off the side (' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + W + ')');
    if (r.width < 24 || r.height < 24) faults.push('small ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (cy >= 0 && cy <= H && cx >= 0 && cx <= W) { const top = document.elementFromPoint(cx, cy); if (top && top !== b && !b.contains(top) && !top.contains(b)) faults.push('under ' + name(top)); }
    const text = (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible') faults.push('its text is cut (' + b.scrollWidth + ' in ' + b.clientWidth + ')');
    out.push({ el: name(b), text, at: [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)], off: !!b.disabled, faults });
  }
  // the parts of the studio that show (those with an id), for "what is gone"
  const parts = [...document.querySelectorAll('.brs [id]')].filter((el) => vis(el) && el.getBoundingClientRect().height >= 8).map((el) => el.id);
  return { step: (document.querySelector('[data-fstep]') || { dataset: {} }).dataset.fstep || null, wide: document.documentElement.scrollWidth > W + 1 ? 'the page is wider than the screen: ' + document.documentElement.scrollWidth : null, buttons: out, parts };
};

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}), args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const seen = {};
  const open = async (id, url) => {
    const ctx = await browser.newContext({ ...PHONE });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log(`[${id}] PAGE ERROR ${String(e.message).slice(0, 300)}`));
    await ctx.route('**/api/auth/me', (route) => route.fulfill({ json: { authEnabled: false, user: null } }));
    const API = path.resolve(__dirname, '../../../../BE/api'), MODELS = JSON.parse(fs.readFileSync(path.join(API, 'src/server/studio/model-files.json'), 'utf8')).files;
    await ctx.route('**/api/studio/model/*', (route) => { const m = MODELS.find((f) => route.request().url().endsWith('/' + f.name));
      return m ? route.fulfill({ body: fs.readFileSync(path.join(API, m.dir, m.name)), contentType: 'application/octet-stream' }) : route.fulfill({ status: 404, body: '' }); });
    await p.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => document.querySelector('.brs') && document.querySelector('.brs').__studio, null, { timeout: 120000 });
    await p.waitForTimeout(1200);
    const see = async (name) => {
      await p.waitForTimeout(900);
      const v = await p.evaluate(lookAt); seen[`${id}-${name}`] = v;
      console.log(`[${id}] LOOK ${name} step=${v.step}${v.wide ? ' · ' + v.wide : ''}`);
      for (const b of v.buttons) console.log(`[${id}]   ${b.faults.length ? 'FAULT' : 'ok   '} ${b.el} "${b.text}" at ${b.at.join(',')}${b.off ? ' (off)' : ''}${b.faults.length ? ' · ' + b.faults.join(' · ') : ''}`);
      try { const buf = await p.screenshot({ type: 'jpeg', quality: 40, fullPage: true }); fs.writeFileSync(path.join(OUT, `${id}-${name}.jpg`), buf); console.log(`SHOT ${id}-${name} ${buf.toString('base64')} END`); } catch (e) { console.log('no picture: ' + e.message); }
      return v;
    };
    const next = () => p.evaluate(() => { const b = [...document.querySelectorAll('[data-fnext]')].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled; }); if (b) { b.click(); return (b.innerText || '').trim(); } return null; });
    const gone = (a, b, what) => { const A = seen[`${id}-${a}`], B = seen[`${id}-${b}`]; if (!A || !B) return;
      console.log(`[${id}] ${what}: gone ${JSON.stringify(A.parts.filter((x) => !B.parts.includes(x)))} · new ${JSON.stringify(B.parts.filter((x) => !A.parts.includes(x)))}`); };
    return { p, ctx, see, next, gone };
  };
  const songReady = (p) => p.waitForFunction(() => /confirmed|double-checked|^Ready/.test(document.getElementById('s1st').textContent), null, { timeout: 300000 });
  const song = media.songs.find((s) => s.name === 'bhangra_dhol_98') || media.songs[0];
  const clipFiles = media.clips.filter((c) => !c.short).slice(0, 4).map((c) => path.join(MEDIA, c.file));

  // ---- 1. Beat Sync on a phone: Music, Adjust Music, Clips, and Adjust Music opened again from Clips
  try {
    const { p, ctx, see, next, gone } = await open('music', '/create/music');
    await see('1-first');
    console.log('[music] pressed: ' + await next()); await see('2-choose');
    await p.setInputFiles('#mfile', path.join(MEDIA, song.file));
    await songReady(p); await p.waitForTimeout(2500);
    await see('3-adjust');
    console.log('[music] pressed: ' + await next()); await see('4-clips');
    await p.setInputFiles('#vfile', clipFiles); await p.waitForTimeout(6000); await see('5-clips-added');
    const had = await p.evaluate(() => { const b = document.getElementById('fadjust'); if (!b) return 'no #fadjust'; const r = b.getBoundingClientRect(); if (!(r.width > 0)) return '#fadjust does not show'; b.click(); return 'pressed Adjust Music'; });
    console.log('[music] ' + had); await see('6-adjust-again');
    gone('3-adjust', '6-adjust-again', 'Adjust Music the first time against opened again from Clips');
    // every button of Adjust Music, pressed once: what goes away with it
    const ids = (seen['music-6-adjust-again'] || { buttons: [] }).buttons.filter((b) => b.el.startsWith('#') && !b.off && !/fback|fnext|fhome|menu|#play|pvfull/i.test(b.el) && b.el !== '#mpick').map((b) => b.el);
    let before = seen['music-6-adjust-again'];
    for (const sel of ids.slice(0, 24)) {
      const ok = await p.evaluate((s) => { const b = document.querySelector(s); if (!b || b.hasAttribute('data-fnext')) return false; b.click(); return true; }, sel).catch(() => false);
      if (!ok) continue;
      await p.waitForTimeout(700);
      const v = await p.evaluate(lookAt), lost = before.parts.filter((x) => !v.parts.includes(x)), came = v.parts.filter((x) => !before.parts.includes(x));
      console.log(`[music] after ${sel}: step=${v.step} gone ${JSON.stringify(lost)} new ${JSON.stringify(came)}`);
      if (v.step !== 'adjust') { console.log('[music]   (left Adjust Music: stopping here)'); break; }
      before = v;
    }
    await see('7-adjust-after-presses');
    await ctx.close();
  } catch (e) { console.log('[music] FAILED ' + e.message.split('\n')[0]); }

  // ---- 2. Copy a Reel on a phone: the Reel to copy is a small Reel made here (three clips under the song)
  try {
    const ref = path.join(OUT, 'reel-to-copy.webm'), c = media.clips.filter((x) => !x.short && !x.darkUntil).slice(0, 3).map((x) => path.join(MEDIA, x.file));
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-t', '2', '-i', c[0], '-t', '2', '-i', c[1], '-t', '2', '-i', c[2], '-i', path.join(MEDIA, song.file),
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a', '-t', '6', '-c:v', 'libvpx', '-b:v', '1200k', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', ref], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('the Reel to copy could not be made');
    const { p, ctx, see, next, gone } = await open('copy', '/create/copy');
    await see('1-first');
    const chooser = p.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    console.log('[copy] pressed: ' + await next());
    const fc = await chooser;
    if (fc) { console.log('[copy] the file picker opened'); await fc.setFiles(ref); } else { console.log('[copy] NO file picker opened from the first button'); await see('1b-no-picker'); await p.setInputFiles('#reffile', ref); }
    await p.waitForTimeout(1500); await see('2-reel-picked');
    await p.waitForFunction(() => { const t = (document.getElementById('frefst') || {}).textContent || ''; return t && !/^Reading|^Pick a Reel/.test(t.trim()); }, null, { timeout: 240000 }).catch(() => console.log('[copy] the Reel was not read in 4 minutes'));
    console.log('[copy] says: ' + await p.evaluate(() => (document.getElementById('frefst') || {}).textContent));
    await songReady(p).catch(() => console.log('[copy] its song was not ready in 5 minutes: ' + ''));
    await p.waitForTimeout(2000); await see('3-reel-read');
    await p.setInputFiles('#vfile', clipFiles); await p.waitForTimeout(6000); await see('4-clips-added');
    for (const [sel, name] of [['#frefother', '5-different-song'], ['#frefsong', '6-use-its-song'], ['#fadjust', '7-adjust-music']]) {
      const did = await p.evaluate((s) => { const b = document.querySelector(s); if (!b) return 'is not on the page'; const r = b.getBoundingClientRect(); if (!(r.width > 0)) return 'does not show'; b.click(); return 'pressed'; }, sel);
      console.log(`[copy] ${sel} ${did}`); if (did === 'pressed') { await see(name); gone('4-clips-added', name, 'after ' + sel); }
    }
    await ctx.close();
  } catch (e) { console.log('[copy] FAILED ' + e.message.split('\n')[0]); }

  fs.writeFileSync(path.join(OUT, 'look.json'), JSON.stringify(seen, null, 1));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, media, scenarios: [] }, null, 1));
  await browser.close();
})();
