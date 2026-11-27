// Talking videos (talking head, vlog, tutorial), as the website makes them (components/studio/engine.ts, TALKING VIDEOS):
// the clips' own voice is the sound of the Reel. Where people speak is found on the phone (Silero VAD, Models.kt; loudness
// when it cannot run); the silences between sentences are cut (tight / natural / relaxed pauses, or none), each take keeps
// its order. The voice is brought to one loudness; the song, if there is one, plays under it and steps back further while
// someone speaks. That one sound track becomes the Reel's sound (ES.buf), so captions (the voice is what is heard) and
// export work as for a song. The video is shown as it was filmed: no punch-in, a video wider than the Reel fitted whole.
// The phone has no RNNoise: the voice is used as recorded (the website, too, when its cleanup cannot run).
// @ts-nocheck
import { keyframesFor } from './pure';
import { findRetakes, wordsWithout } from '@mobile/video-engine';

export function createTalkBrain(ES, EH){
const PACE = { tight: { pre: 0.08, post: 0.12, merge: 0.22 }, natural: { pre: 0.12, post: 0.2, merge: 0.42 }, relaxed: { pre: 0.18, post: 0.3, merge: 0.8 } };
const VOICE_RMS = 0.12;   // about -18 dBFS of speech: room for the music and the limiter
if(ES.talkPace === undefined) ES.talkPace = 'natural';
if(ES.talkMusic === undefined) ES.talkMusic = 0.09;
if(ES.talkToken === undefined) ES.talkToken = 0;
if(!ES.talkDrop) ES.talkDrop = { base: '', keys: [] };
async function voiceOf(src, si){
  if(src.voice) return src.voice;
  const P = await EH.clipPcm(si);   // the clip's own sound, read by the phone (SoundReader.kt); null: it has none
  if(!P || !P.x || P.x.length < 0.3*P.sr){ src.voice = { has: false }; return src.voice; }
  const sr = P.sr, pcm = P.x;
  let pk = 0; for(let i=0;i<pcm.length;i+=8) pk = Math.max(pk, Math.abs(pcm[i]));
  if(pk < 0.003){ src.voice = { has: false }; return src.voice; }   // a silent track
  let probs = null, hop = 512/16000, how = 'ai';
  if(EH.speechProbs){ try{ probs = await EH.speechProbs(pcm, sr); }catch(e){ console.info('speech model not used:', e && e.message); } }
  if(!probs){   // loudness: 10 dB over the quiet floor of the clip counts as speech
    how = 'level'; const n = Math.floor(pcm.length/(hop*sr)), db = new Float32Array(n), w = Math.round(hop*sr);
    for(let k=0;k<n;k++){ let s2 = 0; for(let i=k*w;i<(k+1)*w;i+=2) s2 += pcm[i]*pcm[i]; db[k] = 10*Math.log10(s2/(w/2) + 1e-10); }
    const floor = Float32Array.from(db).sort()[Math.floor(n*0.1)] || -60; probs = db.map(v => v > floor + 10 ? 0.9 : v > floor + 6 ? 0.4 : 0.1);
  }
  src.voice = { has: true, raw: pcm, clean: null, pcm, sr, probs, hop, how };
  return src.voice;
}
// speech parts of a clip in seconds: in above 0.5, out after 0.2 s below 0.35, then padded and short pauses kept
function speechParts(v, dur, pace){
  if(pace === 'off') return [[0, dur]];
  const P = PACE[pace] || PACE.natural, out = [], h = v.hop; let on = -1, low = 0;
  v.probs.forEach((p, k) => { if(on < 0){ if(p > 0.5) on = k; } else if(p < 0.35){ if(++low*h >= 0.2){ out.push([on*h, (k-low+1)*h]); on = -1; low = 0; } } else low = 0; });
  if(on >= 0) out.push([on*h, v.probs.length*h]);
  const pad = out.filter(([a,b]) => b - a >= 0.12).map(([a,b]) => [Math.max(0, a - P.pre), Math.min(dur, b + P.post)]), merged = [];
  for(const s of pad){ const L = merged[merged.length-1]; if(L && s[0] - L[1] < P.merge) L[1] = Math.max(L[1], s[1]); else merged.push(s.slice()); }
  return merged.filter(([a,b]) => b - a >= 0.25);
}
// where to split a long take: the quietest moment (lowest speech probability) 2.5-4.5 s in
function splitPoint(v, a, b){
  const h = v.hop; let best = Math.min(b, a + 3.2), bp = Infinity;
  for(let t = a + 2.5; t <= Math.min(b - 1, a + 4.5); t += h){ const p = v.probs[Math.round(t/h)] ?? 1; if(p < bp){ bp = p; best = t; } }
  return best;
}
function rmsOf(x, gate = 0.01){ let s2 = 0, n = 0; for(let i=0;i<x.length;i+=4){ const v = x[i]; if(Math.abs(v) > gate){ s2 += v*v; n++; } } return Math.sqrt(s2/Math.max(1, n)); }
// Retakes (Shared/video-engine retakes.ts): a line the creator stopped and said again soon after is left out, the last
// take kept, as an editor does. Found from the captions' words once they are heard (no second transcription: the words
// move with their parts), for the clips and pace they were heard with; not for a saved Reel.
const talkBase0 = () => ES.sources.map(s => EH.fpOf(s)).join(',') + '|' + ES.talkPace + '|raw';
const partKey = p => p.si + ':' + p.a.toFixed(2);
async function dropRetakes(){
  if(ES.kind !== 'talk' || !ES.talk || ES.keepSaved || !ES.capAll || ES.capAll.from) return false;
  const base0 = talkBase0(); if(ES.talkDrop.base === base0) return false;   // these clips' words were looked at already
  ES.talkDrop = { base: base0, keys: [] };
  const parts = ES.talk.parts, { drop } = findRetakes(parts, ES.capAll.words);
  if(!drop.length) return false;
  drop.forEach(i => ES.talkDrop.keys.push(partKey(parts[i])));
  ES.capAll = { from: 0, words: wordsWithout(parts, ES.capAll.words, drop) };
  EH.notify(drop.length + (drop.length > 1 ? ' retakes' : ' retake') + ' left out: the line you said again is kept');
  await buildTalk(); EH.shiftCaptions(); return true;
}
async function buildTalk(){
  ES.nomake = '';   // set again below when these clips have no voice
  const token = ++ES.talkToken;
  if(!ES.sources.length) return;
  EH.stopAll();
  for(let si = 0; si < ES.sources.length; si++){ await voiceOf(ES.sources[si], si); if(token !== ES.talkToken) return; }
  const parts = [];
  ES.sources.forEach((src, si) => { if(!src.voice.has) return; for(const [a,b] of speechParts(src.voice, src.dur, ES.talkPace)) parts.push({ si, a, b }); });
  // the retakes found in these clips' words (dropRetakes) stay out
  let retakes = 0;
  if(ES.talkDrop.base === talkBase0() && ES.talkDrop.keys.length) for(let k = parts.length - 1; k >= 0; k--) if(ES.talkDrop.keys.includes(partKey(parts[k]))){ parts.splice(k, 1); retakes++; }
  const mute = ES.sources.filter(s => !s.voice.has).length;
  if(!parts.length){ ES.nomake = 'We could not hear anyone talking in these clips. For a Beat Reel, choose "Beat Reel".'; ES.edit = []; return; }
  // one rate for the Reel's sound: the first voice's (the website uses its audio device's rate)
  const sr = ES.sources.find(s => s.voice.has).voice.sr, T = parts.reduce((q,p)=>q + p.b - p.a, 0), N = Math.round(T*sr); const voice = new Float32Array(N), act = new Float32Array(N);
  // the voice: the parts end to end, 8 ms fades at every join (no clicks), one loudness for every clip
  const fade = Math.round(0.008*sr); let o = 0;
  for(const p of parts){
    const v = ES.sources[p.si].voice, g = VOICE_RMS/Math.max(0.005, rmsOf(v.pcm)), a = Math.round(p.a*v.sr), n = Math.min(N - o, Math.round((p.b - p.a)*sr));
    p.t0 = o/sr;
    for(let i=0;i<n;i++){ const j = a + Math.round(i*v.sr/sr); let x = (v.pcm[j] || 0)*g; if(i < fade) x *= i/fade; else if(i > n - fade) x *= (n - i)/fade; voice[o+i] = x;
      act[o+i] = (v.probs[Math.floor((p.a + i/sr)/v.hop)] || 0) > 0.5 ? 1 : 0; }
    o += n; p.t1 = o/sr;
  }
  const base = ES.sources.map(s=>EH.fpOf(s)).join(',') + '|' + ES.talkPace + '|raw|' + T.toFixed(2);
  // the music under it: the song's best part as long as the talk (repeated if the talk is longer), at one loudness,
  // stepping back while someone speaks (80 ms down, 400 ms back up)
  const mix = EH.getCtx().createBuffer(2, N, sr);
  for(let c=0;c<2;c++) mix.getChannelData(c).set(voice);
  if(ES.song && ES.talkMusic > 0){
    const W = ES.song.buf, st = W.duration > T + 0.5 ? EH.bestPart(T) : 0, gm = ES.talkMusic*VOICE_RMS/Math.max(0.005, rmsOf(ES.song.mono)), ws = W.sampleRate;
    const dn = Math.exp(-1/(0.08*sr)), up = Math.exp(-1/(0.4*sr)); let env = 1;
    const chans = [W.getChannelData(0), W.getChannelData(Math.min(1, W.numberOfChannels-1))];
    for(let i=0;i<N;i++){
      const target = act[i] ? 1 : 2.2; env = target < env ? target + (env - target)*dn : target + (env - target)*up;
      let ts = st + i/sr; if(ts >= W.duration) ts = ts % W.duration;
      const j = Math.floor(ts*ws), edge = Math.min(1, i/(0.3*sr), (N - i)/(0.6*sr));
      for(let c=0;c<2;c++) mix.getChannelData(c)[i] += chans[c][j]*gm*env*edge;
    }
  }
  if(token !== ES.talkToken) return;
  ES.buf = mix; ES.mono = new Float32Array(N); { const L = mix.getChannelData(0), R = mix.getChannelData(1); for(let i=0;i<N;i++) ES.mono[i] = (L[i] + R[i])/2; }
  ES.normGain = 1; ES.secStart = 0; ES.beats = []; ES.period = 0.5; ES.peaks = []; ES.peakS = [];
  ES.talk = { voice, orig: voice, base, sr, parts, songKey: ES.song && ES.talkMusic > 0 ? ES.song.key : '', sig: base, retakes, mute };
  // the shots: one per part; a long one is split at its quietest moment
  const shots = [];
  for(const p of parts){
    const v = ES.sources[p.si].voice; let a = p.a, t0 = p.t0;
    while(p.b - a > 5){ const m = splitPoint(v, a, p.b); shots.push({ si: p.si, in: a, start: t0, end: t0 + (m - a) }); t0 += m - a; a = m; }
    shots.push({ si: p.si, in: a, start: t0, end: p.t1 });
  }
  const useCount = ES.sources.map(()=>0);
  // the talking video is shown as it was filmed (2026-11-27, the creator's ask): no punch-in on a jump cut, and a video
  // wider than the Reel is fitted whole over its own blurred copy, not cut down at its sides
  const [cW, cH] = EH.SIZES[ES.aspect];
  ES.edit = shots.map((sh) => {
    const src = ES.sources[sh.si], e = { start: sh.start, end: sh.end, type: 'cut', fx: 'Hard cut', tr: 'hard', efx: 'none', sp: EH.SPEED.normal,
      src: sh.si, in: sh.in, scaleR: 1, cx: 0.5, cy: 0.45, face: 0, fs: 0, mot: 0, ov: 0, el: src.els[(useCount[sh.si]++)%3], dirWhy: '', why: '' };
    if(src.w && src.h && src.w/src.h > (cW/cH)*1.15) e.cs = { fit: true, bg: 'blur' };
    const fz = (src.faces || []).filter(f => f.n > 0 && f.t >= sh.in && f.t <= sh.in + (sh.end - sh.start));
    if(fz.length){ e.face = fz.length/Math.max(1, (src.faces || []).filter(f => f.t >= sh.in && f.t <= sh.in + (sh.end - sh.start)).length);
      e.cx = fz.reduce((q,f)=>q + f.fx, 0)/fz.length; e.cy = fz.reduce((q,f)=>q + f.fy, 0)/fz.length; e.fs = fz.reduce((q,f)=>q + (f.fs || 0), 0)/fz.length; }
    e.kf = keyframesFor(e); e.beatsIn = [];
    return e;
  });
  ES.plan = ES.edit.map(e => ({ start: e.start, end: e.end, type: e.type, fx: e.fx, sp: e.sp, tr: e.tr, efx: e.efx, acc: e.acc, ak: e.ak, ref: e.ref, flick: e.flick, trd: e.trd, trRev: e.trRev, black: e.black }));
  ES.edit.forEach(e=>EH.camAt(e, 0));
  ES.editGen = (ES.editGen || 0) + 1;
}
// a Talking Reel or a Beat Reel (the website's setKind, without its page)
async function setKind(k){
  EH.remakeOk();
  if(ES.recording || k === ES.kind) return;
  ES.nomake = '';
  ES.kind = k; if(ES.playing) EH.stopAll();
  ES.capAll = null; ES.capWords = null; ES.capLines = null;
  if(k === 'talk'){ if(ES.sources.length) await buildTalk(); }
  else if(ES.song && EH.useSection) await EH.useSection(); else ES.edit = [];
}
return { voiceOf, speechParts, splitPoint, rmsOf, dropRetakes, buildTalk, setKind };
}
