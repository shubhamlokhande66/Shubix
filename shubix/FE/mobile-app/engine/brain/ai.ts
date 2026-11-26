// Shubix AI: looking at the clips, the pace, the plan and its steps. Moved from
// the website's studio: its state is the object ES, and what is the app's own comes through EH.
// The golden test (scripts/engine-golden.mjs) says it still makes the same Reel.
// @ts-nocheck
import { songSample, toSlots } from './pure';
import { momentsFound, compareMoments, applyCompared, keepOneComparison } from '@mobile/video-engine';
import { sectionsOf } from '../components/studio/soundmap';
import { TEXT_TEMPLATES } from '@mobile/core/lib/text-templates';
import { STICKERS } from '@mobile/core/lib/stickers';

export function createAiBrain(ES, EH){
const framesMade = new WeakMap();   // a clip's frames are made once (Cancel, then Proceed: not again)
// pressed: Make Reel (Next after the clips) asked it: a plan goes straight on, a Free account chooses (Shubix AI or the Free edit)
function aiGate(again = false, pressed = false){
  if(!ES.aiOn) return Promise.resolve(false);
  const id = EH.reelIdNow(); if(ES.aiReel === id) return Promise.resolve(true);
  if(!again && (ES.aiReel === 'no:' + id || ES.gateNo === id)) return Promise.resolve(false);
  if(ES.gateP) return ES.gateP;
  ES.gateP = (async () => {
    const cost = EH.aiCostOf('reel'), bal = EH.aiBal();
    if(cost && bal !== null && bal < cost){
      // too few credits: the Reel is still made, by the phone's own smart edit (like the Free plan), never held back;
      // the top-up is offered once per Reel (not again on every Next)
      EH.aiNeed(false); ES.gateNo = id;
      EH.aiStat('Free edit · Shubix AI needs ' + EH.creditWord(cost) + ' (you have ' + EH.creditWord(bal) + ')');
      EH.aiLog('Edited on your phone: Shubix AI needs ' + EH.creditWord(cost) + ' and you have ' + EH.creditWord(bal) + '.');
      if(ES.lowAsked !== id){ ES.lowAsked = id;
        if(EH.IN_APP) await EH.askCredits({ title: 'Not enough credits for Shubix AI', text: 'Shubix AI needs ' + EH.creditWord(cost) + ' for this Reel and you have ' + EH.creditWord(bal) + '. Your Reel is made now with the Free edit: no credits used.', bal, ok: 'OK' });
        else { const go = await EH.askCredits({ title: bal ? 'Not enough credits' : 'Your Shubix AI credits are used up', text: 'Shubix AI needs ' + EH.creditWord(cost) + ' for this Reel and you have ' + EH.creditWord(bal) + '. Make it now with the Free edit (no credits), or get credits for Shubix AI.', bal, ok: 'Get credits', no: 'Free edit' });
          if(go) EH.openPricing(); } }
      return false; }
    // a plan (Editor, Pro): Make Reel is the answer, no question (as the website)
    const free = ES.planNow === 'free';
    if(pressed && !free){ ES.aiReel = id; ES.gateNo = ''; EH.aiNeed(false); return true; }
    // what Shubix AI does and what it costs, then Use; a Free account also gets the Free edit (✕: nothing runs, nothing is taken)
    // the welcome credits (Free, exactly one Shubix AI Reel's worth): the first Reel says so, it is not a warning
    const first = free && cost && bal === cost;
    const ok = await EH.askCredits({ title: first ? 'Your first Shubix AI Reel is on us 🎉' : free ? 'How should we make your Reel?' : 'Shubix AI will edit this Reel',
      text: first ? 'You have ' + EH.creditWord(bal) + ': enough for one Shubix AI Reel. It finds your best moments, puts the transitions on the beat and adds pro colour.'
        : free ? 'Shubix AI uses ' + EH.creditWord(cost) + ' for this Reel. The Free edit makes it now on your phone, with no credits.'
        : cost ? 'It uses ' + EH.creditWord(cost) + ' for this Reel. A new Reel after changing it uses credits again.' : 'Included in your plan for this Reel.',
      list: ['The best moments of every clip', 'Trendy transitions and effects on the beat', 'Pro colour and framing'],
      bal, after: bal !== null && cost ? bal - cost : null, ok: free ? (cost ? 'Shubix AI · ' + EH.creditWord(cost) : 'Shubix AI') : cost ? 'Use ' + EH.creditWord(cost) : 'Use Shubix AI', ...(free ? { no: 'Free edit' } : {}) });
    if(ok){ ES.aiReel = id; ES.gateNo = ''; EH.aiNeed(false); return true; }
    if(ok === false && free){ ES.aiReel = 'no:' + id; ES.gateNo = id; EH.aiNeed(false); EH.aiStat('Free edit · no credits used'); return false; }   // the Free edit: the phone's own, now
    ES.gateNo = id; EH.aiNeed(true); EH.aiStat('Your Reel waits for Shubix AI · tap "Make it with Shubix AI"');
    return false;
  })().finally(() => { ES.gateP = null; });
  return ES.gateP;
}
// the Reel's moments side by side (compare-shots): asked once the clips are seen, so Shubix knows which one opens best and
// what belongs where. Only a help: when it fails or takes too long the Reel is made as before.
const aiPics = new WeakMap();
async function aiCompare(stop){
  const list = ES.sources.filter(s=>!s.removed), want = compareMoments(list); if(want.length < 3) return;
  const cut = new AbortController(), end = () => cut.abort(), timer = setTimeout(end, 30000); stop.addEventListener('abort', end);
  try{
    EH.aiStat('Shubix is comparing your best moments…');
    for(const s of list) if(s.ai && !aiPics.has(s)){ if(cut.signal.aborted) return; aiPics.set(s, await EH.aiFrames(s)); }   // (seen in an earlier Reel)
    const moments = want.map(([i, k]) => ({ id: i + '_' + k, image: (aiPics.get(list[i]).find(f => Math.abs(f.t - list[i].ai.frames[k].t) < 0.02) || {}).image })).filter(m => m.image);
    if(cut.signal.aborted || moments.length < 3) return;
    const r = await EH.apiFetch('/api/studio/compare-shots', { method:'POST', headers:{'Content-Type':'application/json'}, signal: cut.signal, body: JSON.stringify({ moments }) });
    if(!r.ok) return;
    const res = await r.json(); if(cut.signal.aborted) return;
    if(applyCompared(list, res.moments)) for(const s of list) if(s.ai){ const fp = EH.fpOf(s); EH.aiCache.set(fp, s.ai); try{ EH.keepAiPick(fp, s.ai); }catch(e){} }
  }catch(e){ console.info('moments not compared:', e && e.message); }
  finally{ clearTimeout(timer); stop.removeEventListener('abort', end); list.forEach(s => aiPics.delete(s)); keepOneComparison(list); }
}
async function aiRun(){
  if(!ES.aiOn || ES.aiBusy || !ES.sources.length || EH.aiHeldBack()) return;
  if(!EH.aiReelOk()){ ES.aiBusy = true; const go = await aiGate(); ES.aiBusy = false; if(!go) return; }
  ES.sources.forEach(s=>{ if(!s.ai) EH.aiRestore(s); });
  keepOneComparison(ES.sources.filter(s=>!s.removed));
  const need = ES.sources.filter(s=>!s.ai && !s.aiFailed && !s.removed);
  if(!need.length){ EH.aiDone(); return; }
  ES.aiBusy = true; EH.aiStat('Shubix is looking at ' + need.length + (need.length>1 ? ' clips…' : ' clip…'));
  let charged = 0, failed = 0;
  try{
    const jobs = [];
    for(const [i, s] of need.entries()){ EH.aiStat('Shubix is looking at clip ' + (i + 1) + ' of ' + need.length + '…'); if(ES.aiStopper.signal.aborted) return; let frames = framesMade.get(s); if(!frames){ frames = await EH.aiFrames(s); framesMade.set(s, frames); } if(frames.length) jobs.push({ id: 'c'+jobs.length, src: s, frames }); }
    EH.aiStat('Shubix is choosing the best moments of your clips…'); const found = [];
    for(let k=0; k<jobs.length; k+=12){
      const part = jobs.slice(k, k+12);
      const r = await EH.apiFetch('/api/studio/rank-shots', { method:'POST', headers:{'Content-Type':'application/json'}, signal: ES.aiStopper.signal,
        body: JSON.stringify({ reelId: EH.reelIdNow(), clips: part.map(j=>({ id:j.id, name:j.src.name, frames:j.frames })) }) });
      const res = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error((res.error && res.error.message) || ('Shubix could not do this step (' + r.status + ').'));
      EH.aiSpent();
      charged += res.charged || 0; if(typeof res.balance === 'number' && ES.aiInfo){ ES.aiInfo.balance = res.balance; EH.creditsChanged(); }
      for(const c of res.clips || []){ const j = part.find(x=>x.id===c.id); if(!j) continue;
        aiPics.set(j.src, j.frames); framesMade.delete(j.src);   // answered: its pictures are not needed again, only the labels stay
        j.src.ai = { frames: c.frames, about: c.about, summary: c.summary, mood: c.mood }; const fp = EH.fpOf(j.src); EH.aiCache.set(fp, j.src.ai);
        try{ EH.keepAiPick(fp, j.src.ai); }catch(e){}
        found.push({ clip: ES.sources.indexOf(j.src) + 1, what: c.summary }); }
      // what it found, while the person waits (only real moments, the newest first: the flow review with ChatGPT)
      { const line = momentsFound(found); if(line) EH.aiStat(line + '…'); }
      for(const f of res.failed || []){ const j = part.find(x=>x.id===f.id); if(j){ j.src.aiFailed = true; framesMade.delete(j.src); failed++; } }
    }
    if(!ES.sources.some(s=>!s.ai && !s.aiFailed && !s.removed)) await aiCompare(ES.aiStopper.signal);
    if(ES.aiStopper.signal.aborted) return;
    ES.aiBusy = false;
    if(ES.sources.some(s=>!s.ai && !s.aiFailed && !s.removed) && !ES.pending) return aiRun();   // clips added meanwhile
    EH.aiDone(charged, failed);
  }catch(e){
    ES.aiBusy = false;
    if(e && e.name === 'AbortError') return;
    need.forEach(s => framesMade.delete(s));
    if(ES.aiOn){ console.warn('AI picks failed:', e); aiDown(); return; }   // never the phone's own edit instead
    ES.aiGaveUp = EH.reelIdNow();
    console.warn('AI picks not used:', e); EH.aiStat('Shubix could not look at your clips right now. Your Reel uses the best moments picked on your phone' + (EH.aiCostOf('reel') && ES.dirPlannedReel !== EH.reelIdNow() ? ' · any credits taken for it come back within the hour.' : '.'));
    EH.chatFail('Shubix could not look at your clips right now. Try again in a moment.');
    EH.aiLog('Shubix AI could not look at your clips this time: your Reel uses the phone’s own edit.');
  }
}
// New mix: the AI's other plans for these cuts, all in one call (the input is sent once)
async function variantsRun(st){
  st.asked = true; st.busy = true;
  EH.aiStat('Shubix is making ' + EH.VARIANTS + ' more versions for Change Reel…');
  const tm = timeoutSignal(90000);
  let n = 0;
  try{
    const cands = EH.directorCandidates(), { req, ctx } = EH.dirRequest(cands), sig = EH.planSig();
    const r = await EH.apiFetch('/api/studio/direct', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...req, variants: EH.VARIANTS }), signal: tm.signal });
    const res = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error((res.error && res.error.message) || ('Shubix could not make the mixes (' + r.status + ').'));
    let k = 1;
    for(const pl of res.plans || []){ while(st.plans[k]) k++; st.plans[k] = { slots: toSlots(pl.slots, cands), ctx, sig, story: pl.story || '' }; n++; }
    EH.aiStat('Shubix made ' + n + ' more version' + (n === 1 ? '' : 's') + ' · press Change Reel to see each.');
    if(n) EH.aiLog('Shubix AI made ' + n + ' more version' + (n === 1 ? '' : 's') + ' of your Reel (Change Reel shows each).');
  }catch(e){
    if(!(e && e.name==='AbortError') || tm.timedOut()) console.warn('AI mixes not used:', e);
    EH.aiStat('Change Reel uses the phone\'s own versions in Shubix\'s style.');
  }finally{ st.busy = false; tm.done(); }
  if(ES.mixNo > 0 && ES.buf && ES.sources.length && !ES.recording) EH.makeEdit();
}
// a request that gives up after ms (the phone's own edit is already on screen, so nobody waits for a slow AI)
function timeoutSignal(ms){
  const c = new AbortController(); let late = false;
  const t = setTimeout(()=>{ late = true; c.abort(); }, ms), stop = () => c.abort();
  ES.aiStopper?.signal.addEventListener('abort', stop);
  EH.ac.signal.addEventListener('abort', stop);
  return { signal: c.signal, timedOut: () => late, done: () => { clearTimeout(t); EH.ac.signal.removeEventListener('abort', stop); } };
}
// Shubix AI hears 30 s of the part the Reel uses, once per song and part; a failure never stands in the way of the Reel
async function hearSong(){
  if(!ES.song || !ES.song.mono || ES.kind === 'talk') return;
  const key = ES.song.key + '|' + Math.round(ES.secStart || 0); if(ES.songHeard === key) return;
  const body = songSample(ES.song.mono, ES.song.buf.sampleRate, ES.secStart || 0, 30); if(!body) return;
  ES.songHeard = key; ES.songFeel = null;
  const tm = timeoutSignal(45000);   // the AI hears the song with retries on the server (20 s was cut short on QA, 2026-11-18)
  try{ const r = await EH.apiFetch('/api/studio/song?reel=' + encodeURIComponent(EH.reelIdNow()), { method:'POST', headers:{'Content-Type':'audio/wav'}, body, signal: tm.signal });
    if(!r.ok) throw new Error('song ' + r.status); ES.songFeel = await r.json(); }
  catch(e){ ES.songHeard = ''; console.warn('The song was not heard:', e); }
  finally{ tm.done(); }
}
async function paceRun(key){
  const sm = EH.getSoundMap(); if(!sm){ ES.paceFailedKey = key; return; }
  const whole = EH.wholeSections(), songKey = EH.paceSongKey();
  const secs = whole || sectionsOf(sm, ES.basePlan, ES.beats, ES.period, ES.buf.duration).slice(0, 24);
  if(!secs.length){ ES.paceFailedKey = key; return; }
  ES.paceBusy = true; EH.aiStat('Shubix is listening to the song and choosing the pace…');
  await hearSong();
  const tm = timeoutSignal(25000);
  try{
    const req = { mode: ES.mode, reelId: EH.reelIdNow(), ...(ES.tplKind ? { reelKind: ES.tplKind } : {}), wish: ES.wish.slice(-800), duration: +(whole ? ES.song.buf.duration : ES.buf.duration).toFixed(2), bpm: +(60/(whole ? ES.song.r.period : ES.period)).toFixed(1), clips: ES.sources.filter(s=>!s.removed).length,
      footage: +ES.sources.reduce((a,s)=>a+(s.removed?0:s.dur||0),0).toFixed(1), kind: EH.isPhotoMode() ? 'photo' : 'music', sections: secs, reference: EH.refContext(), ...(ES.songFeel ? { song: ES.songFeel } : {}), about: ES.sources.map(s=>!s.removed && s.ai && s.ai.about).filter(Boolean).join('; ').slice(0, 400),
      ...(whole ? { reel: +ES.buf.duration.toFixed(2) } : {}) };
    const r = await EH.apiFetch('/api/studio/pace', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(req), signal: tm.signal });
    const res = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error((res.error && res.error.message) || ('Shubix could not choose the pace (' + r.status + ').'));
    EH.aiSpent();
    const every = new Map((res.sections || []).map(x=>[x.i, x.every]));
    const answer = secs.map(s=>({ t: s.t, len: s.len, every: every.get(s.i) || s.now }));
    if(whole) ES.songPace.set(songKey, { secs: answer, story: res.story || '' });   // kept even if the part moved meanwhile
    if(EH.paceKey() !== key){ ES.paceBusy = false; if(ES.buf && ES.sources.length && !ES.recording) EH.paceMaybe(); return; }
    if(whole){ const p = EH.paceFromSong(ES.songPace.get(songKey)); ES.pacing = p ? { key, ...p, why: res.sections || [] } : null; }
    else ES.pacing = { key, story: res.story || '', secs: answer, why: res.sections || [] };
    if(!ES.pacing){ ES.paceFailedKey = key; ES.paceBusy = false; return; }
    ES.paceCache.set(key, ES.pacing);
    EH.aiStat('Shubix chose the pace' + (ES.pacing.story ? ': ' + ES.pacing.story : '') + '. Now planning the shots…');
    EH.aiLog('Shubix AI chose the pace' + (ES.pacing.story ? ': ' + ES.pacing.story : '.'));
    ES.paceBusy = false; EH.makeEdit();
  }catch(e){
    ES.paceFailedKey = key;
    if(!(e && e.name==='AbortError') || tm.timedOut()) console.warn('AI pace not used:', e);
    ES.paceBusy = false; if(ES.buf && ES.sources.length && !ES.recording) EH.directorMaybe();
    // the director did not start (already planned, or no edit yet): the line must not stay on "choosing the pace…"
    if(!ES.dirBusy && /…$/.test(EH.aiStatText())) EH.aiStat('Your Reel keeps the song\'s own pace.');
  }finally{ ES.paceBusy = false; tm.done(); }
}
/* Shubix AI could not do this Reel after a minute of asking (the server down): no Reel from the phone's own edit. Make Reel
 * says so (nativeEngine "ai" fails with TEAM_MSG); the server gives back any credits taken. */
const TEAM_MSG = 'Our team is working on it. Please try again in a little while. No credits were used.';
function aiDown(){ if(!ES.aiOn) return; ES.aiDown = true; ES.aiGaveUp = EH.reelIdNow();   // (nothing is waited for any more)
  EH.aiStat(TEAM_MSG); EH.chatFail(TEAM_MSG); EH.aiLog('Shubix AI was not available. ' + TEAM_MSG); }
async function directorRun(key){
  ES.dirBusy = true; EH.aiStat('Shubix is choosing every shot, transition and effect…');
  // the loader stays until Shubix answers (a down server is asked again for a minute: apiFetch); 4 min: given up (the
  // server's AI gives up before that and the credits come back). Never the phone's own edit instead: aiDown.
  const tm = timeoutSignal(240000);
  let late = false;
  const soft = setTimeout(() => EH.aiStat('Shubix is still working on your Reel…'), 75000);   // no phone's edit meanwhile: the loader stays
  try{
    await hearSong();
    const cands = EH.directorCandidates(); ES.dirCands = cands;
    const { req, ctx } = EH.dirRequest(cands), sig = EH.planSig(), mix = ES.mixNo, st = EH.mixStore();
    const r = await EH.apiFetch('/api/studio/direct', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(req), signal: tm.signal });   // (asked again for a minute: nativeEngine apiFetch)
    const res = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error((res.error && res.error.message) || ('Shubix could not plan the Reel (' + r.status + ').'));
    const slots = toSlots(res.slots, cands);
    if(!slots.some(x => x && !x.auto)) throw new Error('Shubix returned no usable plan.');
    EH.chatSync(res); if(typeof res.balance === 'number' && ES.aiInfo){ ES.aiInfo.balance = res.balance; EH.creditsChanged(); }
    if(ES.chatAsk && req.chat) ES.chatAsk = null;   // that chat message is answered (and charged once)
    if(!st.plans[mix]) st.plans[mix] = { slots, ctx, sig, story: res.story || '' };   // kept for the song's other parts
    if(late){
      // it came after the phone's edit was shown: offered, never swapped in under the person (or during an export)
      clearTimeout(soft);
      ES.dirPlannedReel = EH.reelIdNow();
      const use = () => { if(ES.recording || ES.exportBusy) return; ES.dirFailedKey = ''; if(EH.dirKey() === key){ if(EH.dirArrived(key, { slots, story: res.story || '', texts: res.texts, actions: res.actions })) EH.makeEdit(); } else if(ES.buf && ES.sources.length) EH.directorMaybe(); };
      EH.aiStat('Shubix\'s plan for your Reel is ready.');
      EH.notifyAct('Shubix\'s plan for your Reel is ready.', 'Use it', use, 60000);
      return;
    }
    // the edit changed meanwhile (the song's part moved): the plan is fitted to it, or a new one asked (other clips)
    if(EH.dirKey() !== key){ ES.dirBusy = false; if(ES.buf && ES.sources.length && !ES.recording) EH.directorMaybe(); return; }
    ES.dirBusy = false; ES.dirPlannedReel = EH.reelIdNow();
    if(EH.dirArrived(key, { slots, story: res.story || '', texts: res.texts, actions: res.actions })) EH.makeEdit();
  }catch(e){
    ES.dirFailedKey = key;
    const back = EH.aiCostOf('reel') && ES.dirPlannedReel !== EH.reelIdNow() ? ', and the credits for it come back.' : '.';
    if(late){ aiDown(); }
    else {
      EH.chatFail(tm.timedOut() ? 'Shubix took too long this time. Try again in a moment.' : 'Shubix could not change the Reel right now. Try again in a moment.');
      if(tm.timedOut()) EH.aiStat('Shubix took too long this time. Your Reel uses the phone\'s own smart edit' + back);
      else if(!(e && e.name==='AbortError')){ console.warn('AI director not used:', e); EH.aiStat('Shubix is busy right now. Your Reel uses the phone\'s own smart edit' + back); }
    }
    if(late || !(e && e.name==='AbortError') || tm.timedOut()) aiDown();
  }finally{ clearTimeout(soft); if(!late) ES.dirBusy = false; tm.done(); }
}
/* ---- Shubix AI as the editor: what a person does with the tools (texts and their keyframes, video boxes, the look, captions,
 * the song's sound, the voice), the AI does with the same tools; its steps are used as it gave them ---- */
function aiTexts(list){
  if(!Array.isArray(list) || !list.length) return 0;
  const D = EH.reelLen();
  ES.overlays = ES.overlays.filter(o => o.aiIntent !== 'ai').concat(list.map(x => ({ id: ++ES.ovSeq, aiIntent: 'ai', text: x.text, emoji: !!x.emoji || !!STICKERS[x.stk], ...(STICKERS[x.stk] ? { stk: x.stk } : {}), style: x.style, color: x.color, anim: x.anim,
    loop: x.loop === 'none' ? undefined : x.loop, out: x.out === 'none' ? undefined : x.out, font: x.font || undefined, behind: !!x.behind, track: !!x.track, x: x.x, y: x.y, size: x.size, all: false, ...(Number.isFinite(x.focus) ? { focus: x.focus } : {}),
    t0: Math.max(0, Math.min(D - 0.1, x.start)), t1: Math.max(0.1, Math.min(D, x.end)), uk: (x.keys || []).map(k => ({ t: k.at, x: k.x, y: k.y, s: k.s, r: k.r, o: k.o, ez: k.ez })) })));
  ES.overlays.filter(o => o.font).forEach(o => EH.loadFont(o.font).then(EH.redraw));
  ES.ovSel = -1; EH.renderOvList(); EH.redraw(); return list.length;
}
async function aiActions(list){
  let done = 0;
  const steps = (Array.isArray(list) ? list : []).slice().sort((a, b) => a.do === 'shot' && b.do === 'shot' ? (+b.i || 0) - (+a.i || 0) : 0);
  for(const a of steps){
    try{
      if(a.do === 'look'){ if(EH.pickLook(a.name)) done++; }
      else if(a.do === 'captions'){ await EH.setCaptions(a.on !== false, a.language, a.translation); if(a.style) EH.setCaptionStyle(a.style); done++; }
      else if(a.do === 'music'){ const p = {}; if(Number.isFinite(+a.volume)) p.mvol = Math.max(0, Math.min(1, +a.volume)); if(Number.isFinite(+a.fadeIn)) p.mfin = Math.max(0, +a.fadeIn);
        if(Number.isFinite(+a.fadeOut)){ p.mfout = Math.max(0, +a.fadeOut); p.mfoutManual = true; } EH.auSet(p); ES.clipMixKey = ''; await EH.ensureMix(); done++; }
      else if(a.do === 'voicefx'){ if(EH.pickVoiceFx(a.fx)) done++; }
      else if(a.do === 'voiceover' && EH.tts && EH.tts.voices.length && a.text){ ES.pos = Math.max(0, Math.min(EH.reelLen() - 0.5, +a.at || 0)); await EH.addTtsAtPlayhead(a.text, a.voice || EH.tts.voices[0].key); done++; }
      else if(a.do === 'sound' && EH.SFX_NAMES[a.kind] && ES.buf){ ES.sfxList.push({ id: ++ES.sfxSeq, at: +Math.max(0, Math.min(EH.reelLen(), +a.at || 0)).toFixed(2), kind: a.kind }); EH.sfxUI(); ES.clipMixKey = ''; await EH.ensureMix(); done++; }
      else if(a.do === 'shot' && EH.SHOT_OPS.includes(a.op) && ES.edit[+a.i]){ const e = ES.edit[+a.i], len = e.end - e.start;
        ES.pos = e.start + Math.max(0.05, Math.min(len - 0.05, Number.isFinite(+a.at) ? +a.at : len/2));
        if(a.op === 'reverse'){ EH.shotSet({ rev: a.on !== false }); done++; } else if(EH.shotOp(a.op)) done++; }
      else if(a.do === 'beatmark'){ const ts = (Array.isArray(a.at) ? a.at : [a.at]).map(Number).filter(Number.isFinite); if(a.clear) EH.clearMarks(); for(const t of ts.slice(0, 32)) if(EH.addMark(Math.max(0, t))) done++; }
      else if(a.do === 'template' && TEXT_TEMPLATES[a.name]){ if(EH.addTemplate(a.name, Array.isArray(a.words) ? a.words : [], +a.at || 0, Number.isFinite(+a.len) && +a.len > 0 ? +a.len : undefined, true)) done++; }
      else if(a.do === 'background' && ['none','blur','color'].includes(a.mode)){ EH.pickBackground(a.mode, a.color); done++; }
      else if(a.do === 'pop'){ if(await EH.subjectPop(false)) done++; }
      else if(a.do === 'finish' && ['bars', 'tint', 'bw'].includes(a.what)){ if(EH.finishSet(a.what, a.on !== false)) done++; }
      else if(a.do === 'layer'){
        const s = ES.sources[parseInt(String(a.clip).replace(/\D/g, ''), 10) - 1]; if(!s || !s.file || !ES.edit.length) continue;
        const M = await EH.addLayerMedia(s.file), D = EH.reelLen(), t0 = Math.max(0, Math.min(D - 0.1, +a.start || 0)), mask = ['circle', 'rect'].includes(a.mask) ? a.mask : 'none';
        ES.lmedia.push(M);
        ES.layers.push({ id: ++ES.lySeq, m: ES.lmedia.length - 1, t0, t1: Math.max(t0 + 0.1, Math.min(D, Number.isFinite(+a.end) ? +a.end : D)), in: Math.max(0, Math.min((M.dur || 1) - 0.1, +a.from || 0)),
          ...JSON.parse(JSON.stringify(EH.LY0)), x: Number.isFinite(+a.x) ? +a.x : 0.5, y: Number.isFinite(+a.y) ? +a.y : 0.5, s: Math.max(0.05, Math.min(1, +a.size || 0.5)),
          rad: Math.max(0, Math.min(1, +a.radius || 0)), mask, fin: Math.max(0, +a.fadeIn || 0), fout: Math.max(0, +a.fadeOut || 0), aiIntent: 'ai',
          op: Number.isFinite(+a.opacity) ? Math.max(0, Math.min(1, +a.opacity)) : 1, r: +a.rotate || 0, blend: EH.BLENDS.includes(a.blend) ? a.blend : 'source-over',
          ...(a.key ? { key: { on: true, c: /^#[0-9a-f]{6}$/i.test(a.key) ? a.key : '#00FF00', tol: Number.isFinite(+a.tolerance) ? Math.max(0.05, Math.min(0.9, +a.tolerance)) : 0.35 } } : {}) });
        done++;
      }
    }catch(e){ console.warn('Shubix AI step not done:', a && a.do, e); }
  }
  if(ES.layers.length){ EH.lyUI(); await EH.prepLayers(ES.pos); }
  EH.redrawFrame(); EH.saveNow(); return done;
}
  return { aiRun, aiGate, directorRun, variantsRun, paceRun, aiActions, aiTexts, timeoutSignal };
}
