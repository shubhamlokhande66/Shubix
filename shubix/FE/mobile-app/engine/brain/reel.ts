// Making a Reel: the shots from the song, the clips and the AI's plan (makeEditNow). Moved from
// the website's studio: its state is the object ES, and what is the app's own comes through EH.
// The golden test (scripts/engine-golden.mjs) says it still makes the same Reel.
// @ts-nocheck
import { endWell, TAIL, crossesScene, suitFx, rampSpeed, keyframesFor, windowStats, blackPart, goodSecs } from './pure';
import { repace } from '../components/studio/soundmap';
import { inferAutonomousMood, createAutonomousReelPlan, validateAutonomousReelPlan, createDirectorPlan, evaluateKeyframes, reviewAutonomousEdit, chooseEditTake, editTakesFor, EDIT_REVIEW_LIMITS, SHORT_REEL } from '@mobile/video-engine';
import { TR_DUR } from '@mobile/core/lib/shaders';
import { toneOf, matchTones, describeBudget } from '@mobile/video-engine';

export function createReelBrain(ES, EH){
// The edit's own review (shared/video-engine review.ts), as the website's studio gives it (engine.ts reviewOf): the same
// edit gets the same review on both.
// Every transition lands on its beat (as an editor sets it, and as ChatGPT asked about this Reel's song put it: QA
// 2026-11-19): the new shot is fully in ON the beat, so the transition plays in the time just before it. A transition
// started at the beat showed the new shot 0.2-0.45 s late (a whole beat on a 185 BPM song). The shot then starts that
// much earlier (the one before it ends earlier) and its footage starts as much earlier, so on the beat it shows the
// moment chosen for it. A flash and a glitch are not moved: their peak is their first frame, already on the beat. The
// lead is kept (trLead) for the edit's review, which measures the cut at start + lead. At most 45% of the shot before.
function landTransitions(list){
  const NO = ['hard', 'flash', 'glitch', 'fadein'];
  for(let i = 1; i < list.length; i++){
    const e = list[i], pv = list[i-1]; e.trLead = 0;
    if(!e.tr || NO.includes(e.tr) || e.black || (e.cs && e.cs.rev)) continue;
    const d = e.trd ?? (TR_DUR[e.tr] || 0), r = Math.max(0.05, (e.sp && e.sp.at ? e.sp.at(0) : 1)*(e.scaleR || 1));
    // (footage from before its moment; else, a clip used from its first frame, the moment a little later, from the footage after it)
    const sd = ES.sources[e.src] ? ES.sources[e.src].dur : 0, after = Math.max(0, sd - TAIL - (e.in + e.sp.pos(e.end - e.start)*(e.scaleR || 1)));
    let L = Math.min(d, 0.45*(pv.end - pv.start)); const back = (e.in || 0) >= L*r;
    if(!back) L = Math.min(L, after/r);
    if(!(L >= 1/30)) continue;
    L = +L.toFixed(3); pv.end -= L; e.start -= L; if(back) e.in = +Math.max(0, e.in - L*r).toFixed(3); e.trLead = L;
    for(const x of [pv, e]){ x.kf = keyframesFor(x); x.beatsIn = ES.beats.filter(b=>b>x.start+0.12 && b<x.end-0.05).map(b=>b-x.start); }
  }
}
function reviewOf(list){
  const t0 = list[0].start, gmax = Math.max(1e-6, ...ES.sources.flatMap(s => (s.samples || []).map(x => x.m)));
  const shots = list.map(e => { const s = ES.sources[e.src], need = e.sp.pos(e.end - e.start)*(e.scaleR || 1);
    const st = s && s.samples && s.samples.length ? windowStats(s, e.in, e.in + Math.max(need, 0.05)) : null;
    return { start: e.start - t0, end: e.end - t0, sourceIndex: e.src, sourceStart: e.in, sourceEnd: e.in + need, kind: e.type,
      ...(st ? { sharpness: st.sh/(s.shMed || 1), brightness: st.b, darkSeconds: (st.dark || 0)*Math.max(need, 0.05), motion: Math.min(1, st.m/gmax), face: st.face } : {}),
      effect: e.efx || 'none', transition: e.tr || 'hard', transitionLead: e.trLead || 0, locked: !!(e.byDir || (e.uk && e.uk.length)) }; });
  // the song's own drops (its analysis, before the plan was made from it): each should have a cut on it
  const drops = (ES.cuts || []).filter((c, k) => ES.cutType[k] === 'drop').map(c => c - t0);
  return reviewAutonomousEdit({ shots, beats: ES.beats.map(x => x - t0), drops, duration: list[list.length-1].end - t0, sourceCount: ES.sources.length, sourceDurations: ES.sources.map(s => s.dur), cutLead: 1/30 });
}
// Colour match (Shared/video-engine colorMatch.ts): each shot pulled part of the way to the Reel's middle look (light,
// contrast, colour, warmth) through its Adjust (cs), as an editor evens clips from different phones and rooms. Not for a
// copied Reel (its own look) or Shubix AI's plan; a shot the creator adjusted is left as it is.
function colourMatch(){
  if(ES.mode === 'copy' || EH.aiTrusted()) return;
  const tones = ES.edit.map(e => { const s = ES.sources[e.src]; if(!s || !s.samples || (e.cs && (e.cs.bri || e.cs.con || e.cs.sat || e.cs.warm))) return null;
    const need = e.sp.pos(e.end - e.start)*(e.scaleR || 1), t = toneOf(s.samples, e.in, e.in + Math.max(need, 0.05)); return t ? { ...t, secs: e.end - e.start } : null; });
  matchTones(tones).forEach((f, i) => { if(f){ ES.edit[i].cs = { ...(ES.edit[i].cs || {}), ...f }; ES.edit[i].cm = true; } });
}
function tasteFx(e, i, t){
  if(ES.mode === 'copy' || EH.aiTrusted()) return;
  const len = e.end - e.start, photo = EH.isPhotoMode();
  if(EH.BEAT_FX.includes(e.efx)){ if(ES.mode === 'fast' && e.type === 'drop' && !t.shape) t.shape = true; else e.efx = 'none'; }
  if(e.efx === 'hook' && i > 0) e.efx = 'none';
  if(e.type === 'drop' && i > 0 && len >= 0.4 && e.efx !== 'snap' && !EH.BEAT_FX.includes(e.efx)) e.efx = ES.mode === 'smooth' ? 'zoomburst' : EH.recipeNow().zoom;
  if(EH.ZOOM_FX.has(e.efx)){
    const ok = e.type === 'drop' || (ES.mode === 'fast' && e.type === 'hit' && !t.prevZoom && e.start - t.lastZoom >= 3 && !(t.drops || []).some(d => d > e.start && d - e.start < 3));
    if(!ok) e.efx = photo || len >= 2.5 ? 'pan-soft' : 'none';
  }
  if(e.efx === 'pan') e.efx = photo || len >= 2.5 ? 'pan-soft' : 'none';   // Ken Burns, without the bounce on every beat
  if(EH.MOVE_FX.has(e.efx) && !photo){
    if(len < 2.5 || t.moves >= Math.ceil(t.n / 3)) e.efx = 'none'; else t.moves++;
  }
  if(photo && e.efx === 'none') e.efx = 'pan-soft';   // a photo always moves a little (Ken Burns); a still one looks stuck
  t.prevZoom = EH.ZOOM_FX.has(e.efx) || e.efx === 'hook';
  if(t.prevZoom) t.lastZoom = e.start;
}
// Motion-matched cuts (the website's motionMatch, engine.ts): a pan carried through the cut becomes a whip in its
// direction; a whip or push the rules chose goes the way the camera moves. The AI's and the copied Reel's own are kept.
function motionMatch(){
  if(ES.mode === 'smooth' || ES.edit.length < 2 || EH.copyExact()) return;   // a copied Reel: its own cuts, hard ones too
  const gxIn = (src, a, b) => { const S = (src.samples || []).filter(x => x.t >= a && x.t <= b && x.gx !== undefined); return S.length ? S.reduce((q, x) => q + x.gx, 0)/S.length : 0; };
  const span = e => { const used = e.sp.pos(e.end - e.start)*(e.scaleR || 1); return [e.in, e.in + used]; };
  let whips = Math.max(1, Math.round(2*Math.max(1, ES.buf.duration/30))) - ES.edit.filter(e => e.tr === 'whip').length, lastWhip = -9;
  ES.edit.forEach((e, i) => {
    if(!i || e.trByDir || e.trByRef) return;
    const pe = ES.edit[i-1], src = ES.sources[e.src], psrc = ES.sources[pe.src]; if(!src || !psrc) return;
    const [, pb] = span(pe), [ea] = span(e);
    const out = gxIn(psrc, pb - 0.45, pb), inn = gxIn(src, ea, ea + 0.45), len = e.end - e.start, plen = pe.end - pe.start;
    const sameWay = Math.abs(out) >= 0.5 && Math.abs(inn) >= 0.5 && Math.sign(out) === Math.sign(inn);
    const dir = Math.abs(inn) >= 0.35 ? inn : Math.abs(out) >= 0.5 ? out : 0;
    if(e.tr === 'whip'){ if(dir) e.trRev = dir > 0; lastWhip = i; return; }
    if(e.tr === 'slideleft' || e.tr === 'slideright'){ if(dir) e.tr = dir > 0 ? 'slideright' : 'slideleft'; return; }
    if(sameWay && whips > 0 && i - lastWhip >= 3 && len >= 0.35 && plen >= 0.35 && !['flash','dip','dissolve','fadein','dipwhite'].includes(e.tr)){
      e.tr = 'whip'; e.trRev = out > 0; e.trd = undefined; e.why = (e.why ? e.why + ' · ' : '') + 'whip with the camera move'; whips--; lastWhip = i;
    }
  });
}
function makeEditNow(){
  if(ES.refReading) return;   // the Reel to copy is being read: its copy is made right after (no ordinary Reel meanwhile)
  EH.life({ stage: 'making the Reel', clips: ES.sources.length });
  if(ES.exportBusy){ ES.remakeAfterExport = true; return; }   // a late AI answer: the video being made keeps its edit
  if(ES.keepSaved) return;   // an opened Reel: as it was saved
  if(ES.kind === 'talk'){ if(ES.sources.length) EH.buildTalk(); return; }
  if(ES.story && EH.storyEdit()) return;
  if(!ES.buf || !ES.sources.length) return;
  const keptUk = EH.ukKeep();
  EH.stopAll(); ES.plan = EH.adaptPlan(); { const pc = EH.paceNow(); if(pc) ES.plan = EH.beatEdit(endWell(EH.noFlashCuts(EH.withPartCuts(repace(ES.basePlan, pc.secs.map(x => ({ ...x, every: x.every === 'hits' ? 1 : x.every === 'flicker' ? 8 : x.every })), ES.beats, ES.buf.duration, ES.mode, ES.downbeats || [])))), pc.secs); } EH.styleEdit(); let dirInfo = EH.applyDirectorStyle(); if(!dirInfo) EH.finishTransitions(); EH.tastePlan();
  if(ES.slowAll && ES.plan) ES.plan.forEach(s => { s.sp = EH.SPEED.slow; });   // slow motion asked for in words: every shot, whatever the style gave it
  const gmax = Math.max(1e-6, ...ES.sources.flatMap(s=>s.samples.map(x=>x.m)));
  const used = ES.sources.map(()=>[]);
  // the opening shot picks first (the first 2 seconds decide if people keep watching), then drops, hits, breaks, the rest
  // "In my order": each shot has its clip and its part of that clip (seqSlots), so the clips play one after another
  // one clip always plays forward (its shots out of order jump back and forth in time)
  // several clips that are very little video together (under 5 s) play in order too: mixed, their moments showed twice
  const thin = ES.sources.length > 1 && ES.sources.reduce((t, s) => t + goodSecs(s), 0) < SHORT_REEL.enough;
  let seq = (ES.seqOn || thin || ES.sources.length === 1) && ES.sources.length ? EH.seqSlots(ES.plan.length) : null; ES.seqFloor = 0.4;
  // In my order, each clip is one shot (1 2 3 4…): the song's cuts that would fall inside a clip are let go, so its
  // shot runs on to the next clip's cut (a cut from a clip to itself looked like the same clip shown twice)
  // Copy a Reel keeps every one of the reference's cuts where it is (a cut inside one clip is a jump forward in it)
  if(seq && (ES.seqOn || thin) && ES.sources.length > 1 && !EH.copyExact()){
    // (very little video in all: each clip one shot, as before; otherwise the cuts a clip has footage for stay: seqKeepCuts)
    if(thin){ for(let i = ES.plan.length - 1; i > 0; i--) if(seq[i] === seq[i-1]){
      ES.plan[i-1] = { ...ES.plan[i-1], end: ES.plan[i].end, sp: ES.slowAll ? EH.SPEED.slow : EH.SPEED.normal }; ES.plan.splice(i, 1); seq.splice(i, 1);
    } }
    else EH.seqKeepCuts(seq);
    // a shot no slower than 0.4x can fill (a 2.5 s clip under a 9 s shot stood still for 3 s, its camera move still
    // drifting over the stopped picture): its cut moves, its time goes to the clips beside it that have footage to
    // spare, on a beat where one is near
    // too little footage in all for the song even at 0.4x: every clip a little slower still (down to 0.25x), evenly
    const footAll = seq.reduce((a, si) => a + Math.max(0.05, ES.sources[si].dur - TAIL), 0), reelLen = ES.plan[ES.plan.length-1].end - ES.plan[0].start;
    ES.seqFloor = Math.min(0.4, Math.max(0.25, footAll/reelLen*0.98));
    const cap = i => Math.max(0.3, (ES.sources[seq[i]].dur - TAIL)/ES.seqFloor), len = i => ES.plan[i].end - ES.plan[i].start;
    if(ES.plan.some((_, i) => len(i) > cap(i) + 0.02)){
      // each shot at most what its clip fills; the time over goes to the shots with room, in proportion to it
      const L = ES.plan.map((_, i) => Math.min(len(i), cap(i)));
      for(let pass = 0; pass < 6; pass++){
        const D = reelLen - L.reduce((a, b) => a + b, 0), room = L.map((l, i) => Math.max(0, cap(i) - l)), R = room.reduce((a, b) => a + b, 0);
        if(D <= 0.01 || R <= 0.01) break;
        L.forEach((l, i) => { L[i] = l + Math.min(room[i], D*room[i]/R); });
      }
      // the cuts again from these lengths, each on a beat when one is near and the shots around it still fit
      let t = ES.plan[0].start;
      for(let i = 0; i < ES.plan.length - 1; i++){
        let c = t + L[i]; const b = ES.beats.reduce((x, y) => Math.abs(y - c) < Math.abs(x - c) ? y : x, Infinity);
        if(Math.abs(b - c) < 0.3 && b - t <= cap(i) + 1e-6 && b - t >= 0.4) c = b;
        ES.plan[i] = { ...ES.plan[i], start: t, end: c }; t = c;
      }
      ES.plan[ES.plan.length-1] = { ...ES.plan[ES.plan.length-1], start: t };
    }
  }
  // In my order moved the cuts to fit the clips (above), after Shubix AI's plan was looked for: the plan was asked for
  // these moved cuts, so it is applied now (it was dropped, and the paid plan's transitions, effects and keyframes with it)
  if(!dirInfo && EH.aiTrusted()){ dirInfo = EH.applyDirectorStyle(); if(ES.slowAll) ES.plan.forEach(s => { s.sp = EH.SPEED.slow; }); }
  const order = ES.plan.map((s,i)=>i).sort((a,b)=>{ const pr={drop:0,hit:1,break:2,cut:3}; return (a===0?-1:pr[ES.plan[a].type]) - (b===0?-1:pr[ES.plan[b].type]) || a-b; });
  const res = new Array(ES.plan.length); ES.dupCount = 0;
  // Shared Director pass: rank the source clips once, then use its explainable quality ranking
  // as a gentle prior in the existing per-shot visual scorer. The music edit still owns timing;
  // the existing AI's explicit shot choices remain authoritative.
  const directorShots = ES.sources.map((src, sourceIndex) => {
    const samples = src.samples || [];
    const avg = (key, fallback = 0) => samples.length ? samples.reduce((n, x) => n + (Number(x[key]) || 0), 0) / samples.length : fallback;
    const sharp = avg('sh') / Math.max(1e-6, src.shMed || 1);
    const faceScore = Math.max(0, Math.min(1, (src.faces || []).filter(x => x.n).length / Math.max(1, (src.faces || []).length)));
    const quality = Math.max(0, Math.min(1, 0.55 + (sharp - 1) * 0.18 + (avg('b') - 0.45) * 0.2 - EH.clipFlaw(src) * 0.08));
    const aiSummary = EH.aiAt(src, 0, src.dur);
    const motion = Math.max(0, Math.min(1, avg('m')));
    const roles = aiSummary ? aiSummary.roles : {}, tags = EH.aiTags(src);
    return { id: String(sourceIndex), sourceIndex, duration: src.dur, sourceStart: 0, sourceEnd: src.dur,
      quality, motion, aestheticScore: aiSummary ? Math.max(0, Math.min(1, aiSummary.score || 0)) : quality,
      faceScore, subjectScore: Math.max(faceScore, Math.max(0, Math.min(1, avg('b')))),
      isHighlight: !!(aiSummary && aiSummary.score > 0.82),
      tags, isProduct: tags.includes('product'), isFood: tags.includes('food'), isLandscape: tags.includes('travel'),
      isOpening: roles.hook > 0.55, isEnding: roles.ending > 0.55, isDetail: roles.detail > 0.55,
      isAction: motion > 0.68 || roles.action > 0.55,
      isUsable: src.dur > 0.35 && quality > 0.08,
      speech: !!(src.voice && src.voice.has) };
  });
  const directorMusic = { duration: ES.buf.duration, beats: ES.beats, downbeats: ES.downbeats && ES.downbeats.length ? ES.downbeats : ES.beats.filter((_, i) => i % 4 === 0),
    drops: ES.plan.filter(x => x.type === 'drop').map(x => x.start),
    quietRanges: ES.plan.filter(x => x.type === 'break').map(x => [x.start, x.end] as [number, number]) };
  const inferredMood = ES.mode === 'fast' ? 'energetic' : ES.mode === 'smooth' ? 'minimal' : inferAutonomousMood(directorShots, directorMusic).mood;
  const autonomousDirector = createAutonomousReelPlan({
    shots: directorShots, music: directorMusic,
    targetDuration: Math.min(180, ES.buf.duration), aspect: ES.aspect,
    mood: inferredMood,
    platform: EH.ON_PHONE ? 'android' : 'web',
    intensity: ES.mode === 'fast' ? 'bold' : ES.mode === 'smooth' ? 'subtle' : 'balanced',
  });
  const autonomousErrors = validateAutonomousReelPlan(autonomousDirector);
  // Keep the established scorer as a safety fallback until the autonomous plan passes validation.
  const sharedDirector = autonomousErrors.length ? createDirectorPlan({
    shots: directorShots, beats: ES.beats, drops: ES.plan.filter(x => x.type === 'drop').map(x => x.start),
    targetDuration: Math.min(180, ES.buf.duration), aspect: ES.aspect,
    mood: ES.mode === 'fast' ? 'energetic' : ES.mode === 'smooth' ? 'minimal' : 'cinematic',
    mobile: EH.ON_PHONE,
    intensity: ES.mode === 'fast' ? 'bold' : ES.mode === 'smooth' ? 'subtle' : 'balanced',
  }) : autonomousDirector;
  const sharedRank = new Map(sharedDirector.shots.map((shot, rank) => [shot.sourceIndex, rank]));
  const sharedRankMax = Math.max(1, sharedDirector.shots.length - 1);
  // the director's chosen moments are held for their own cuts
  const held = ES.plan.map((s,i)=>{ const d = EH.dirShot(i); return d ? {i, si:d.src, a:d.in, b:d.in + s.sp.pos(s.end-s.start)} : null; }).filter(Boolean);
  const pick = (i, allowNeighbour, allowOverlap, anyScene, seen, only) => {
    const s = ES.plan[i], len = s.end - s.start, dir = EH.dirShot(i), near = EH.flowNear(i, res, gmax);
    let best=null, bs=-Infinity;
    ES.sources.forEach((src,si)=>{
      if(only != null && si !== only) return;   // (a repair: a moment of this one clip)
      let need = s.sp.pos(len), scaleR = 1;
      if(need > src.dur-TAIL){ scaleR = Math.max(0.05, (src.dur-TAIL)/need*0.98); need *= scaleR; }
      if(!allowNeighbour && ES.sources.length>1 && [res[i-1],res[i+1]].some(x=>x && x.src===si)) return;
      const stepT = Math.max(0.1, Math.min(0.5, src.dur/120));
      const tryAt = (a) => {
        let ov = 0; used[si].forEach(([u0,u1])=>{ ov += Math.max(0, Math.min(u1,a+need)-Math.max(u0,a)); });
        if(!allowOverlap && ov > 0.001) return;          // a moment of footage is used only once
        if(!allowOverlap && held.some(h=>h.i!==i && h.si===si && !res[h.i] && Math.min(h.b,a+need)-Math.max(h.a,a) > 0.001)) return;
        if(!anyScene && crossesScene(src, a, a+need)) return;   // a shot never runs across a cut inside the clip
        const w = EH.scoreWindow(i, src, a, need, gmax, near);
        // A black part of a clip (it opens on black, a cut to black) is not footage to show: such a moment is not
        // taken while any other can be, footage shown twice included (a second of black looks broken; a moment seen
        // again does not). Not for a dark clip (night, a stage: four fifths of it or more under the limit): that is
        // the clip as filmed, and its moments are weighed as before. The last pass takes what there is.
        if(!anyScene && !seen && blackPart(src) && (w.st.dark || 0)*need >= EDIT_REVIEW_LIMITS.darkSeconds) return;
        // (a repair: only a moment that can be seen; for a clip brought into the Reel, a sharp one too)
        if(seen && (w.st.b < EDIT_REVIEW_LIMITS.dark || (w.st.dark || 0)*need >= EDIT_REVIEW_LIMITS.darkSeconds || (seen === 2 && w.st.sh/(src.shMed||1) < EDIT_REVIEW_LIMITS.soft))) return;
        let sc = w.sc - 5*ov/need + EH.rng()*0.15;
        const directorRank = sharedRank.get(si);
        if(directorRank != null) sc += 0.18 * (1 - directorRank / sharedRankMax); // soft preference, never overrides explicit AI picks
        const isDir = dir && dir.src===si && Math.abs(a-dir.in) < 0.26;
        if(isDir) sc += 4;   // the director's choice wins whenever the rules allow it
        if(sc>bs){ const st=w.st; bs=sc; best={src:si, in:a, scaleR, cx: st.face>0.3 ? st.fx : st.cx, cy: st.face>0.3 ? st.fy : 0.45, face: st.face, fs: st.fs, mot: w.m, ov, aiNote: w.ai ? w.ai.note : '', byDir: isDir}; }
      };
      for(let a=0; a<=src.dur-need-TAIL+1e-6; a+=stepT) tryAt(a);
      if(dir && dir.src===si && dir.in <= src.dur-need-TAIL+1e-6) tryAt(dir.in);   // its exact moment too (off the scan grid)
    });
    return best;
  };
  ES.editTakes = { tried: 1, kept: 1 };
  if(seq){ EH.seqPick(seq, res, gmax); EH.teaserOpen(seq, res, gmax); }
  else {
    const take = () => { res.fill(undefined); used.forEach(u => { u.length = 0; }); ES.dupCount = 0;
      order.forEach(i=>{
        const len = ES.plan[i].end - ES.plan[i].start;
        let best = pick(i,false,false) || pick(i,true,false) || pick(i,true,true) || pick(i,true,true,true) || {src:0,in:0,scaleR:1,cx:0.5,cy:0.5,face:0,ov:0};
        if(best.ov > 0.001) ES.dupCount++;
        used[best.src].push([best.in, best.in + ES.plan[i].sp.pos(len)*best.scaleR]);
        res[i] = best;
      }); };
    // The edit reviews itself and tries again (Shared/video-engine review.ts, chooseEditTake): when the first take has
    // a fault another take can change (footage shown twice, two parts of one clip in a row, a soft or dark moment, a
    // weak opening), up to two more takes are made, as "New mix" would make them, and the one with the best review is
    // kept. The first take wins a tie, so a clean edit is exactly the edit as before. The random numbers after this go
    // on from the first take's, whichever take is kept: the same clips and song make the same Reel every time.
    const seed0 = ES.seed; let after = seed0, s = seed0;
    const choice = chooseEditTake(k => {
      if(k > 1){ s = (s*7919 + 13) % 2147483647 || 7; ES.seed = s; }
      take(); if(k === 1) after = ES.seed;
      return { res: res.slice(), used: used.map(u => u.slice()), dup: ES.dupCount };
    }, t => reviewOf(ES.plan.map((p, i) => ({ ...p, ...t.res[i] }))), editTakesFor(ES.plan.length, ES.sources.reduce((a, s) => a + (s.dur || 0), 0)));
    choice.take.res.forEach((r, i) => { res[i] = r; }); used.forEach((u, i) => { u.length = 0; u.push(...choice.take.used[i]); });
    ES.dupCount = choice.take.dup; ES.seed = after; ES.editTakes = { tried: choice.tried, kept: choice.kept };
    // The review's repairs that have one right answer (the director's own moments, a copied Reel and Shubix AI's plan
    // are left as they are):
    //  - a shot too dark to see moves to a moment that can be seen, when unused footage has one. A soft shot is not
    //    moved: fast action is soft too, and on a drop it is the right shot.
    //  - a clip of the creator's that no shot shows takes a shot from a clip shown more than once: the shot that loses
    //    least by it, and only when that is less than the scorer takes off for footage it calls bad (the opening stays).
    // No repair shows footage twice or puts two parts of one clip in a row, and the random numbers go on as before it.
    // On Shubix AI's plan too (2026-11-20, as the website's engine.ts): the AI's own moment may give way for a clip left
    // out, never on the opening or a drop, keeping its place, timing and transition; its camera move goes
    if(ES.mode !== 'copy'){
      const seedR = ES.seed, len = i => ES.plan[i].sp.pos(ES.plan[i].end - ES.plan[i].start), span = i => len(i)*res[i].scaleR;
      const stat = i => { const s = ES.sources[res[i].src]; return s && s.samples && s.samples.length ? windowStats(s, res[i].in, res[i].in + Math.max(span(i), 0.05)) : null; };
      const put = (i, alt) => { const u = used[res[i].src], k = u.findIndex(r => r[0] === res[i].in); if(k >= 0) u.splice(k, 1);
        if(res[i].ov > 0.001) ES.dupCount = Math.max(0, ES.dupCount - 1);
        res[i] = alt; used[alt.src].push([alt.in, alt.in + span(i)]); };
      // another moment for shot i (its own footage counts as free while it is looked for), or null
      const other = (i, only) => { const u = used[res[i].src], k = u.findIndex(r => r[0] === res[i].in), own = k >= 0 ? u.splice(k, 1)[0] : null;
        const alt = pick(i, false, false, false, only != null ? 2 : 1, only); if(own) u.push(own); return alt && !(alt.ov > 0.001) ? alt : null; };
      let fixedDark = 0, addedClips = 0;
      order.forEach(i => { if(res[i].byDir) return; const st = stat(i); if(!st || (st.b >= EDIT_REVIEW_LIMITS.dark && (st.dark || 0)*span(i) < EDIT_REVIEW_LIMITS.darkSeconds)) return;
        const alt = other(i); if(alt){ put(i, alt); fixedDark++; } });
      ES.sources.forEach((src, si) => {
        if(res.some(r => r.src === si) || !(src.samples && src.samples.length)) return;
        const count = ES.sources.map((_, k) => res.filter(r => r.src === k).length);
        // the shots it may take: of the clips shown most, eight at most (each one tried is a search of the clip)
        const tryAt = res.map((_, i) => i).filter(i => i > 0 && (!res[i].byDir || (EH.aiTrusted() && ES.plan[i].type !== 'drop')) && count[res[i].src] >= 2).sort((x, y) => count[res[y].src] - count[res[x].src] || x - y).slice(0, 8);
        let bi = -1, balt = null, least = 1;
        for(const i of tryAt){
          const alt = other(i, si); if(!alt) continue;
          const loss = EH.scoreWindow(i, ES.sources[res[i].src], res[i].in, span(i), gmax).sc - EH.scoreWindow(i, src, alt.in, len(i)*alt.scaleR, gmax).sc;
          if(loss < least){ least = loss; bi = i; balt = alt; } }
        if(bi >= 0){ const was = res[bi]; put(bi, balt); addedClips++; if(was.byDir){ res[bi].swapIn = true; ES.plan[bi].ak = []; } } });
      ES.editTakes.fixedDark = fixedDark; ES.editTakes.addedClips = addedClips; ES.seed = seedR;
    }
  }
  const useCount = ES.sources.map(()=>0);   // (players re-assigned by assignPlayers on manual edits)
  ES.edit = ES.plan.map((s,i)=>({...s, ...res[i], el: ES.sources[res[i].src].els[(useCount[res[i].src]++)%3]}));
  EH.flickBuild();
  colourMatch();   // a copied flicker montage: its stills (once per set of clips)
  const taste = { n: ES.edit.length, moves: 0, prevZoom: false, lastZoom: -99, shape: false, drops: ES.edit.filter(x => x.type === 'drop').map(x => x.start) };
  ES.edit.forEach((e,i)=>{
    const d = EH.dirSlotOf(i), shared = sharedDirector.shots.find(x => x.sourceIndex === e.src);
    e.dirWhy = e.swapIn ? 'Shubix brought in a clip of yours that no shot showed' : d ? d.why : '';
    e.cx = 0.5 + (e.cx-0.5)*(e.face>0.3 ? 1 : 0.8);
    if(ES.mode!=='smooth' && !e.fxByDir) suitFx(e);
    tasteFx(e, i, taste);
    // When the optional cloud AI director is unavailable, apply the shared on-device director's
    // renderable treatment as a conservative fallback. Never overwrite an explicit AI choice.
    if(!dirInfo && shared){
      if(!e.fxByDir && e.efx === 'none'){
        const fx = shared.effects.find(id => !!EH.FX_NAME[id]);
        if(fx && (e.end - e.start) >= 0.65) e.efx = fx;
      }
      // The shared plan's transition IDs are renderer-native; keep explicit rules/AI choices intact.
      // (not its transition: a plain cut here is the rules' choice, transitions only where the song changes and rationed;
      // this put the clip's own transition on any such cut, a flash on a cut where the song does nothing: QA 2026-11-19)
      // Apply the shared camera keyframes to the same WebGL/2D draw path used by preview and MP4 export.
      if(!e.ak || !e.ak.length){
        const len = e.end - e.start, scaleTrack = shared.keyframes.find(track => track.property === 'scale');
        const xTrack = shared.keyframes.find(track => track.property === 'x');
        if(len >= 0.3 && scaleTrack && xTrack){
          const sourceDuration = Math.max(0.001, shared.duration);
          e.ak = [0, len].map(t => {
            const sourceTime = t / len * sourceDuration;
            return { t, s: evaluateKeyframes(scaleTrack.keyframes, sourceTime), x: evaluateKeyframes(xTrack.keyframes, sourceTime), y: 0, r: 0, o: 1, ez: 'inOut' };
          });
        }
      }
      if(!ES.slowAll && e.type === 'drop' && shared.speed > 1.05 && (e.end - e.start) >= 0.4) e.sp = rampSpeed(e.end - e.start);
    }
    if(shared && !e.why) e.why = shared.reason;
    e.kf = keyframesFor(e);
    e.beatsIn = ES.beats.filter(b=>b>e.start+0.12 && b<e.end-0.05).map(b=>b-e.start);
  });
  motionMatch();
  landTransitions(ES.edit);
  EH.ukRestore(keptUk);
  EH.setCanvas(); ES.edit.forEach(e=>EH.camAt(e, 0)); EH.renderEDL();
  EH.autoTools(); EH.speechScan();
  EH.editShown(ES.dupCount);
  if(dirInfo && !ES.director.interim){ const shots = ES.edit.filter((e,i)=>EH.dirShot(i)).length, kept = ES.edit.filter(e=>e.byDir).length;
    const keys = ES.edit.reduce((n,e)=>n+((e.acc&&e.acc.length)||0), 0);
    // what the AI really decided: the cuts it answered; the rest are the phone's (said, never hidden)
    const answered = ES.plan.filter((_, i) => { const d = ES.director.slots[i]; return d && !d.auto; }).length;
    if(answered) EH.aiLog('Shubix AI planned your Reel: ' + answered + ' of ' + ES.plan.length + ' shots' + (ES.director.story ? ' — ' + ES.director.story : '') + '.');
    // what the effect budget changed in the AI's plan (aiBudget), said once a Reel, as the website says it
    if(answered && ES.lastBudget){ const said = describeBudget(ES.lastBudget.changes), key = EH.reelIdNow() + '|' + said;
      if(said && ES.budgetTold !== key){ ES.budgetTold = key; EH.aiLog('Shubix checked its plan against the limits a pro editor keeps: ' + said + ' (' + ES.lastBudget.changes.length + ' change' + (ES.lastBudget.changes.length > 1 ? 's' : '') + ').'); } }
    if(!answered) EH.aiStat('Shubix could not plan this Reel. Your Reel uses the phone\'s own smart edit.');
    else EH.aiStat('Shubix planned your Reel' + (ES.director.story ? ': ' + ES.director.story : '') + (answered < ES.plan.length ? ' (' + answered + ' of ' + ES.plan.length + ' shots; the rest from your phone\'s edit)' : '') + (keys ? ' · ' + keys + ' keyframe' + (keys>1?'s':'') + ' on the hits' : '') + (answered < ES.plan.length || ES.director.story ? '' : '.')); }
  // made while the person was in another app (the clips read, the AI's plan arrived): they are told
  EH.tellReadyIfAway();
  EH.captureLoop(); ES.editGen++;
  EH.paceMaybe(); EH.directorMaybe();
  EH.chatReportAuto();
  EH.copyLookSoon();
}
  // the finished edit's review, with its effects and transitions on it (null with no edit, or when it cannot be made)
  function editReview(){ try{ return ES.edit && ES.edit.length ? reviewOf(ES.edit) : null; }catch(e){ return null; } }
  return { makeEditNow, editReview };
}
