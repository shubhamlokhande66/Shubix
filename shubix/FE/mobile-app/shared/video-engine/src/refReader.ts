/** Copy a Reel: the reader of the Reel to copy, the same on the website and in the Android app.
 *
 * What each side does itself is getting the pictures and the sound: the website decodes with WebCodecs (or a <video>),
 * the phone with its hardware decoder (FileServer.kt /frames). Both hand this reader frames as plain pixels (a Pic:
 * width, height, RGBA), the clip scan (its samples and scene changes) and the song reading; everything decided from them
 * (the cuts, what kind each is, the shots, their moves and speeds, the moments the copy is cut to) is decided here, so a
 * Reel read on a phone and on a computer gives the same copy. */
import { motionBetween, revealShape, shotMove } from "./refread";
import { blurCuts, joinFlashes, panelRuns, sharpOfY, warmOf, REF_FX, REF_TRX } from "./refCopy";

/** a frame as pixels: width x height, 4 bytes (RGBA) a pixel */
export type Pic = { width: number; height: number; data: ArrayLike<number> };
/** the colour statistics of a frame (lookStats) */
export type Look = Record<string, number>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const CUT_K = 7;   // frames each side of a cut that are looked at (a fade's dark middle and its clean ends both fit)
export const REF_KINDS: Record<string, string> = { hard: "hard cuts", dissolve: "dissolves", fade: "fades", flash: "flashes", whip: "whip pans", zoom: "zoom-throughs", glitch: "glitches", spin: "spins",
  iris: "circle reveals", diamond: "diamond reveals", heart: "heart reveals", star: "star reveals", wipe: "wipes", bars: "bar reveals", blur: "blur transitions",
  // known by their look (refCopy.ts REF_TRX), the studio's own by these names: learned and copied like the others (2026-11-28)
  burn: "light leaks", zoomblur: "zoom blurs", doors: "curtain reveals", wave: "wave warps", flashblur: "flash blurs", stretch: "stretch smears", zoomout: "zoom outs", slideleft: "slides left", slideright: "slides right", panels: "panel builds", hpanels: "row builds", vpanels: "column builds" };

// colour statistics of a w x h frame's pixels, plus a 96 x 96 crop at full size for grain
export function lookStats(d: ArrayLike<number>, w: number, h: number, cd?: ArrayLike<number> | null): Look {
  const n = w*h, L = new Float32Array(n);
  let sl=0, sl2=0, ss=0, sw=0, hiW=0, hiN=0, loW=0, loN=0, cen=0, cn=0, cor=0, co=0;
  for(let i=0;i<n;i++){ const r=d[i*4]/255, gg=d[i*4+1]/255, b=d[i*4+2]/255, l=0.299*r+0.587*gg+0.114*b, mx=Math.max(r,gg,b), mn=Math.min(r,gg,b);
    L[i]=l; sl+=l; sl2+=l*l; ss += mx>0.04 ? (mx-mn)/mx : 0; const wv=r-b; sw+=wv; if(l>0.6){ hiW+=wv; hiN++; } else if(l<0.35){ loW+=wv; loN++; }
    const x=(i%w)/w-0.5, y=((i/w)|0)/h-0.5, rr=Math.hypot(x,y)/0.7071; if(rr<0.35){ cen+=l; cn++; } else if(rr>0.85){ cor+=l; co++; } }
  const mean=sl/n, sorted=Float32Array.from(L).sort();
  let grain = 0;
  if(cd){ let gs=0, gc=0;
    const Y = (i: number) => 0.299*cd[i*4]+0.587*cd[i*4+1]+0.114*cd[i*4+2];
    for(let y=1;y<95;y++) for(let x=1;x<95;x++){ const i=y*96+x, c=Y(i), avg=(Y(i-1)+Y(i+1)+Y(i-96)+Y(i+96))/4; const grad = Math.abs(Y(i-1)-Y(i+1)) + Math.abs(Y(i-96)-Y(i+96));
      if(grad < 24){ gs += Math.abs(c-avg); gc++; } }
    grain = gc ? gs/gc/255 : 0; }
  return { mean, std: Math.sqrt(Math.max(0, sl2/n-mean*mean)), p5: sorted[Math.floor(n*0.05)], p95: sorted[Math.floor(n*0.95)], sat: ss/n, warm: sw/n,
    split: (hiN ? hiW/hiN : 0) - (loN ? loW/loN : 0), vig: cn && co ? Math.max(0, 1 - (cor/co)/Math.max(1e-3, cen/cn)) : 0, grain };
}
export const avgLook = (arr: Look[]): Look | null => { const o: Look = {}; if(!arr.length) return null; for(const k of Object.keys(arr[0])) o[k] = arr.reduce((q,x)=>q+x[k],0)/arr.length; return o; };

// the Reel being read is letterboxed (wide footage between black bars): its frames are measured without the bars, or every
// cut looks small and every shot looks dark (a night party read as fades to black)
let refBars: { y0: number; y1: number } | null = null;   // the picture's rows, as fractions of the height
export function greyOf(pic: Pic){
  const W0 = pic.width, H0 = pic.height, y0 = refBars ? Math.round(refBars.y0*H0) : 0, FH = refBars ? Math.max(4, Math.round(refBars.y1*H0) - y0) : H0, FW = W0;
  const d = pic.data, o = y0*W0*4, Y = new Float32Array(FW*FH); let m = 0, gx = 0, gy = 0;
  for(let i=0;i<Y.length;i++){ Y[i] = (0.299*d[o+i*4]+0.587*d[o+i*4+1]+0.114*d[o+i*4+2])/255; m += Y[i]; }
  for(let y=1;y<FH-1;y++) for(let x=1;x<FW-1;x++){ const i=y*FW+x; gx += (Y[i+1]-Y[i-1])**2; gy += (Y[i+FW]-Y[i-FW])**2; }
  return { Y, FW, FH, mean: m/Y.length, aniso: gx/Math.max(1e-6, gy) };
}
/** black bars: the rows that stay dark in every one of the frames (12 spread over the Reel) */
export function letterboxOf(pics: (Pic | null)[]){
  const ok = pics.filter(Boolean) as Pic[]; if(ok.length < 6) return null;
  const H0 = ok[0].height, W0 = ok[0].width, rowMax = new Float32Array(H0);
  for(const c of ok){ const d = c.data; for(let y=0;y<H0;y++){ let s2 = 0; for(let x=0;x<W0;x++){ const i=(y*W0+x)*4; s2 += 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; } rowMax[y] = Math.max(rowMax[y], s2/W0/255); } }
  let t = 0; while(t < H0 && rowMax[t] < 0.07) t++; let b = H0 - 1; while(b > t && rowMax[b] < 0.07) b--;
  return (t > 0.06*H0 || H0 - 1 - b > 0.06*H0) && b - t > 0.25*H0 ? { y0: t/H0, y1: (b + 1)/H0 } : null;
}
// around one cut: brightness, blur direction, the sideways jump and the scale change from one frame to the next
export function cutFramesOf(pics: (Pic | null)[]){
  const out: Any = pics.map((c,i)=>c ? {k: i-CUT_K, ...greyOf(c)} : null).filter(Boolean);
  const shift = (A: Float32Array, B: Float32Array, FW: number, FH: number) => { let best = Infinity, bx = 0; for(let dx=-16; dx<=16; dx++) for(let dy=-2; dy<=2; dy++){ let s2 = 0, n = 0;
      for(let y=4;y<FH-4;y+=2) for(let x=17;x<FW-17;x+=2){ s2 += Math.abs(B[y*FW+x] - A[(y-dy)*FW + x-dx]); n++; } s2 = s2/n + 0.0004*(dx*dx+dy*dy); if(s2 < best){ best = s2; bx = dx; } } return bx; };
  const scale = (A: Float32Array, B: Float32Array, FW: number, FH: number) => { let best = Infinity, bs = 1; for(let sc=0.9; sc<=1.3; sc+=0.02){ let s2 = 0, n = 0;
      for(let y=FH*0.2;y<FH*0.8;y+=2) for(let x=FW*0.2;x<FW*0.8;x+=2){ const sx = Math.round(FW/2 + (x-FW/2)/sc), sy = Math.round(FH/2 + (y-FH/2)/sc); s2 += Math.abs(B[Math.round(y)*FW+Math.round(x)] - A[sy*FW+sx]); n++; }
      s2 /= n; if(s2 < best){ best = s2; bs = sc; } } return bs; };
  for(let i=1;i<out.length;i++){ if(out[i].k - out[i-1].k !== 1) continue; out[i].dx = shift(out[i-1].Y, out[i].Y, out[i].FW, out[i].FH); out[i].sc = scale(out[i-1].Y, out[i].Y, out[i].FW, out[i].FH); }
  return out;
}
// a glitch: the red and blue of a frame pushed sideways apart (measured on the small colour frame)
export function rgbShiftOf(pic: Pic | null){
  if(!pic) return 0;
  const W2 = pic.width, H2 = pic.height, d = pic.data;
  let best = 0, bv = Infinity, base = 0;
  for(let sh=-6; sh<=6; sh++){ let s2 = 0, n = 0;
    for(let y=2;y<H2-2;y+=2) for(let x=8;x<W2-8;x++){ const i=(y*W2+x)*4, j=(y*W2+x+sh)*4; s2 += Math.abs(d[i]-d[j+2]); n++; }
    const v = s2/Math.max(1,n); if(sh===0) base = v; if(v < bv){ bv = v; best = sh; } }
  return Math.abs(best) >= 2 && bv < 0.8*base ? Math.abs(best) : 0;
}
// Learning (Teach Shubix from many Reels): a transition this reader does not know. Read as a hard cut, yet not a clean
// one-frame jump: two or more frames in its middle are neither shot, nor a mix of the two (a dissolve). What it looks like
// goes to the learning log (Admin -> My trends), with the studio's own transition it seems to be when there is one (ours).
// a frame of a doors / curtain opening: its middle columns are the new shot, its two sides the old one (or black)
function doorsOf(odd: Any[], A: Any, B: Any){
  const W = A.FW, H = Math.floor(A.Y.length / Math.max(1, W)); if(!W || !H) return 0;
  const band = (F: Any, P: Any, x0: number, x1: number) => { let s = 0, n = 0; for(let y=0;y<H;y++) for(let x=x0;x<x1;x++){ s += Math.abs(F.Y[y*W+x] - P.Y[y*W+x]); n++; } return n ? s/n : 1; };
  const c0 = Math.floor(W*0.4), c1 = Math.ceil(W*0.6), e = Math.max(1, Math.floor(W*0.12));
  return odd.filter(F => { const mB = band(F, B, c0, c1), mA = band(F, A, c0, c1);
    const sides = [[0, e], [W - e, W]].map(([a, b]) => { const dA = band(F, A, a, b), dB = band(F, B, a, b); let dark = 0, n = 0; for(let y=0;y<H;y++) for(let x=a;x<b;x++){ dark += F.Y[y*W+x]; n++; } return dA < 0.6*dB || dark/n < 0.06; });
    return mB < 0.6*mA && sides.every(Boolean); }).length;
}
/** how coloured some small frames are (0 grey .. 1), null: none */
function satOfPics(ps: (Pic | null)[]){
  let s = 0, n = 0;
  for(const p of ps){ if(!p) continue; const d = p.data; for(let i=0;i+3<d.length;i+=16){ const mx = Math.max(d[i], d[i+1], d[i+2]), mn = Math.min(d[i], d[i+1], d[i+2]); if(mx > 20){ s += (mx - mn)/mx; n++; } } }
  return n ? s/n : null;
}
// a frame of a wave warp: its rows slid sideways by amounts that swing back and forth down the picture (a zigzag)
// a shot held tilted (the picture turned a few degrees, the frame's corners showing what is behind it): each corner of the
// frame an empty triangle, its long side down the frame at the top left and bottom right and along it at the other two
// when the picture is turned clockwise (the other way round anticlockwise); the angle is the triangles' short / long side.
// Degrees, clockwise positive (as the studio's turn), or null
function tiltOf(g: Any): number | null {
  const Y = g.Y, W = g.FW, H = Math.floor(Y.length / Math.max(1, W)); if(!W || W < 24 || H < 24) return null;
  const at = (x: number, y: number) => Y[y*W + x];
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    const c = at(cx, cy), same = (v: number) => Math.abs(v - c) < 0.05;
    let h = 0; while(h < W-1 && same(at(cx + dx*h, cy))) h++;
    let v = 0; while(v < H-1 && same(at(cx, cy + dy*v))) v++;
    if(h < 2 || v < 2 || h >= W*0.9 || v >= H*0.9) return null;
    // a sharp edge where each run ends, and the inside of the triangle is the background too
    if(Math.abs(at(cx + dx*h, cy) - c) < 0.06 || Math.abs(at(cx, cy + dy*v) - c) < 0.06) return null;
    if(!same(at(cx + dx*Math.floor(h/4), cy + dy*Math.floor(v/4)))) return null;
    return { h, v };
  };
  const tl = corner(0, 0, 1, 1), tr = corner(W-1, 0, -1, 1), br = corner(W-1, H-1, -1, -1), bl = corner(0, H-1, 1, -1);
  // three corners at least (the picture can be as dark as what is behind it at one), each the way round of the others
  const ks = [tl, tr, br, bl], down = [true, false, true, false], seen = ks.filter(Boolean).length;
  if(seen < 3) return null;
  const cw = ks.every((k, i) => !k || (down[i] ? k.v >= 2*k.h : k.h >= 2*k.v));
  const ccw = ks.every((k, i) => !k || (down[i] ? k.h >= 2*k.v : k.v >= 2*k.h));
  if(!cw && !ccw) return null;
  const deg = ks.filter((k): k is { h: number; v: number } => !!k).map(k => Math.atan(Math.min(k.h, k.v) / Math.max(k.h, k.v)) * 180 / Math.PI);
  if(Math.max(...deg) > 1.6 * Math.min(...deg)) return null;
  const a = deg.reduce((p, q) => p + q, 0) / deg.length;
  return a >= 3 && a <= 40 ? (cw ? a : -a) : null;
}
function waveOf(odd: Any[], A: Any, B: Any){
  const W = A.FW, H = Math.floor(A.Y.length / Math.max(1, W)); if(!W || W < 16 || H < 12) return 0;
  const zig = (F: Any, P: Any) => { const sh: number[] = [];
    for(let y=0;y<H;y+=2){ let best = 0, bd = Infinity; for(let s=-4;s<=4;s++){ let d = 0; for(let x=4;x<W-4;x++) d += Math.abs(F.Y[y*W+x] - P.Y[y*W+x+s]); if(d < bd){ bd = d; best = s; } } sh.push(best); }
    let flips = 0; for(let k=2;k<sh.length;k++) if((sh[k]-sh[k-1])*(sh[k-1]-sh[k-2]) < 0) flips++;
    return Math.max(...sh) - Math.min(...sh) >= 4 && flips >= 3; };
  return odd.filter(F => zig(F, A) || zig(F, B)).length;
}
const streak = (fs: Any[]) => { const a = fs.map(f => f.aniso).filter(x => x !== undefined); return a.length >= 2 && a.filter((x: number) => x < 0.3 || x > 3.3).length * 2 >= a.length; };   // sideways (low) or up-down (high)
export function oddCut(fr: Any[], c: Any, at: (k: number) => Any){
  if(c.kind !== 'hard' || c.one || c.flick || c.flickEnd) return null;
  const A = at(-CUT_K), B = at(CUT_K); if(!A || !B) return null;
  const n = A.Y.length, d = (P: Any, Q: Any) => { let s = 0; for(let q=0;q<n;q++) s += Math.abs(P.Y[q]-Q.Y[q]); return s/n; }, AB = d(A, B);
  if(AB < 0.04) return null;   // the same picture on both sides: nothing to learn
  const mixOff = (F: Any) => { let best = Infinity; for(let a=0; a<=1.001; a+=0.1){ let s = 0; for(let q=0;q<n;q++) s += Math.abs(F.Y[q] - (a*A.Y[q] + (1-a)*B.Y[q])); best = Math.min(best, s/n); } return best; };
  const odd = fr.filter(f => Math.abs(f.k) <= 4 && d(f, A) > 0.3*AB && d(f, B) > 0.3*AB && mixOff(f) > 0.3*AB);
  if(odd.length < 2) return null;
  const avg = (a: number[]) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  const dxs = odd.map(f => f.dx).filter(x => x !== undefined), scs = odd.map(f => f.sc).filter(x => x !== undefined);
  const light = avg(odd.map(f => f.mean)) - (A.mean + B.mean)/2, soft = (c.blurDip ?? 1) < 0.65;
  const side = dxs.length >= 2 && dxs.every(x => Math.sign(x) === Math.sign(dxs[0])) && Math.abs(avg(dxs)) >= 4 ? (avg(dxs) > 0 ? 'right' : 'left') : '';
  const zoom = scs.length >= 2 ? (avg(scs) < 0.97 ? 'out' : avg(scs) > 1.03 ? 'in' : '') : '';
  let guess = 'not known', ours: string | null = null;
  if(doorsOf(odd, A, B) >= 2){ guess = 'curtain / doors open'; ours = 'doors'; }
  else if(waveOf(odd, A, B) >= 2){ guess = 'wave warp'; ours = 'wave'; }
  else if(side && !soft){ guess = 'push / slide'; ours = side === 'left' ? 'slideleft' : 'slideright'; }
  else if(zoom === 'out'){ guess = 'zoom out'; ours = 'zoomout'; }
  // blur all one way (aniso low: streaks, not a soft focus): the picture smears into the next shot, blown out to white
  // or not (seen in trending Reels, 2026-11-28 study); a brighter frame without the streaks is a light leak
  else if(streak(odd) && light > 0.15){ guess = 'flash blur'; ours = 'flashblur'; }
  else if(streak(odd) && soft){ guess = 'stretch smear'; ours = 'stretch'; }
  else if(light > 0.15){ guess = 'light leak / film burn'; ours = 'burn'; }
  const sig = [odd.length + ' frames', light > 0.1 ? 'brighter' : light < -0.1 ? 'darker' : 'same light', side ? 'moves ' + side : 'no sideways move',
    zoom ? 'zoom ' + zoom : 'no zoom', soft ? 'soft' : 'sharp'].join(', ');
  return { guess, ours, sig };
}
export function cutKind(fr: Any, hint: string){
  if(fr.length < 6) return hint === 'cut' ? 'hard' : hint;
  const endF = fr.filter((f: Any)=>Math.abs(f.k) >= CUT_K-1), ends = (endF.length >= 2 ? endF : [fr[0], fr[fr.length-1]]).map((f: Any)=>f.mean).sort((a: number,b: number)=>a-b), endMed = ends[Math.floor((ends.length-1)/2)];
  const mid = fr.filter((f: Any)=>Math.abs(f.k) <= 4), maxB = Math.max(...mid.map((f: Any)=>f.mean)), minB = Math.min(...mid.map((f: Any)=>f.mean));
  if(minB < 0.07 && endMed > 0.12) return 'fade';
  // a flash is brighter than BOTH shots around it (a cut into a bright shot is not a flash)
  const endOf = (side: number) => { const q = fr.filter((f: Any)=>side < 0 ? f.k <= -(CUT_K-1) : f.k >= CUT_K-1).map((f: Any)=>f.mean); return q.length ? q.reduce((a: number,b: number)=>a+b,0)/q.length : endMed; };
  const brighter = maxB - Math.max(endOf(-1), endOf(1));
  if(maxB > 0.78 && maxB > endMed + 0.22 && brighter > 0.15) return 'flash';
  // the reading may have landed at the end of a flash: a white spike a few frames earlier is the cut
  const early = fr.filter((f: Any)=>f.k < -2 && f.k >= -CUT_K), eMax = early.length ? early.reduce((q: Any,f: Any)=>f.mean > q.mean ? f : q, early[0]) : null;
  if(eMax && eMax.mean > 0.78){
    // the shot after it (from 2 frames past the cut read) and whatever comes before the white frame
    const after = fr.filter((f: Any)=>f.k >= 2).map((f: Any)=>f.mean).sort((a: number,b: number)=>a-b), before = fr.filter((f: Any)=>f.k < eMax.k).map((f: Any)=>f.mean);
    const aMed = after.length ? after[(after.length-1)>>1] : endMed;
    if(eMax.mean > aMed + 0.22 && (!before.length || eMax.mean > Math.max(...before) + 0.08)){ fr.shiftTo = eMax.k; return 'flash'; }
  }
  const before = fr.filter((f: Any)=>f.k <= 0 && f.k >= -4 && f.dx !== undefined);
  const whip = before.filter((f: Any)=>Math.abs(f.dx) >= 5 || f.aniso < 0.3).length >= 2;   // a sideways jump or blur
  if(fr.spin && !whip) return 'spin';
  if(fr.glitch) return 'glitch';
  if(whip) return 'whip';
  if(before.filter((f: Any)=>f.sc >= 1.06).length >= 2) return 'zoom';
  if(hint === 'dissolve') return 'dissolve';
  if(hint === 'fade') return 'fade';
  return 'hard';
}
// Every frame of the Reel to copy, small: its hard cuts to the frame and its flicker montages (a new picture on nearly
// every frame). The clip reading (scanMotion) samples a clip and wants a cut to stand out from the change around it: an
// edit cut on every eighth note, stutters of a tenth of a second or the same shot coming back a moment later slipped
// through it (a 29 s car Reel with 61 cuts and a 3 s flicker read as 21 cuts, none in its first 10 s).
export async function frameCuts(small: (ts: number[]) => Promise<(Pic | null)[]>, dur: number, onP?: (p: number) => void){
  const FPS = 30, ts: number[] = []; for(let t=0.5/FPS; t<dur-0.02; t+=1/FPS) ts.push(+t.toFixed(4));
  const n = ts.length, d = new Float32Array(n), hd = new Float32Array(n), sh = new Float32Array(n), far = new Float32Array(n), last: Float32Array[] = [], cel: Float32Array[] = new Array(n); let pY: Float32Array | null = null, pH: Float32Array | null = null;
  for(let k=0;k<n;k+=150){
    const cv = await small(ts.slice(k, k+150));
    cv.forEach((c,j)=>{ const i = k+j; if(!c){ pY = null; last.length = 0; return; }
      const g = greyOf(c), H = new Float32Array(16); for(let q=0;q<g.Y.length;q++) H[Math.min(15, (g.Y[q]*16)|0)] += 1/g.Y.length;
      if(pY && pH && pY.length === g.Y.length){ let s2=0; for(let q=0;q<g.Y.length;q++) s2 += Math.abs(g.Y[q]-pY[q]); d[i] = s2/g.Y.length; let h2=0; for(let q=0;q<16;q++) h2 += Math.abs(H[q]-pH[q]); hd[i] = h2/2; }
      pY = g.Y; pH = H; sh[i] = sharpOfY(g.Y, g.FW);
      { const o = new Float32Array(16*28), cn = new Float32Array(16*28), FH = g.Y.length/g.FW; for(let q=0;q<g.Y.length;q++){ const c = Math.min(27, (((q/g.FW)|0)*28/FH)|0)*16 + Math.min(15, ((q%g.FW)*16/g.FW)|0); o[c] += g.Y[q]; cn[c]++; } for(let c=0;c<o.length;c++) o[c] /= Math.max(1, cn[c]); cel[i] = o; }
      last.push(g.Y); if(last.length > 17) last.shift();
      if(last.length === 17 && i >= 8){ let s3=0; for(let q=0;q<g.Y.length;q++) s3 += Math.abs(g.Y[q]-last[0][q]); far[i-8] = s3/g.Y.length; } });
    if(onP) onP(Math.min(1, (k+150)/n));
  }
  // a flicker: 9 of 15 frames (half a second) jump to another picture; it runs from its first to its last double jump
  const big = (i: number) => d[i] > 0.12, W = 15, fl = new Uint8Array(n), flicker: { t0: number; t1: number }[] = [];
  for(let i=0;i+W<=n;i++){ let c2=0; for(let j=i;j<i+W;j++) if(big(j)) c2++; if(c2 >= 9) fl.fill(1, i, i+W); }
  for(let i=0;i<n;i++){ if(!fl[i]) continue; let j=i; while(j+1<n && fl[j+1]) j++;
    let a=i; while(a<j && !(big(a) && big(a+1))) a++; let b=j; while(b>a && !(big(b) && big(b-1))) b--;
    if(b - a >= 8) flicker.push({ t0: a/FPS, t1: (b+1)/FPS }); i = j; }
  // a hard cut: a jump far above the motion of the 8 frames around it (its neighbours may be cuts too: the median), the
  // brightness histogram moving with it (a fast pan moves the pixels, not the histogram)
  const inF = (t: number) => flicker.some(f => t >= f.t0 - 0.02 && t <= f.t1 + 0.02), cuts: number[] = [];
  for(let i=3;i<n-1;i++){ const t = i/FPS; if(inF(t)) continue;
    const nb: number[] = []; for(let j=Math.max(1,i-4); j<=Math.min(n-1,i+4); j++) if(j !== i) nb.push(d[j]); nb.sort((x,y)=>x-y);
    const loc = nb.length ? (nb[(nb.length-1)>>1] + nb[nb.length>>1])/2 : 0;
    if(d[i] > 0.07 && d[i] > 2.2*loc && d[i] >= d[i-1] && d[i] >= d[i+1] && (hd[i] > 0.08 || d[i] > 0.15)) cuts.push(t); }
  const blank = new Float32Array(16*28);
  return { cuts, flicker, blurs: blurCuts(sh, far, FPS), panels: panelRuns(i => cel[i] || blank, n, 16, 28, FPS) };
}
// A reference shot's speed, read from how much its picture moves over time (a speed ramp is the same footage moving 3x
// faster or slower): five speeds (start, 1/4, middle, 3/4, end) when the shot clearly speeds up or slows down, and a
// freeze (the share of the shot played before the picture stops) when it moved and then stood still. Short or quiet
// shots, and motion that goes up and down with the action, are not read as speed.
export function refSpeedOf(smp: Any[], a: number, b: number, mMax: number, freeze: number | null){
  const a0 = a + 0.35, b0 = b - 0.1, L = b0 - a0, out: { spd?: number[]; frz?: number } = {}; if(L < 0.8) return out;   // the first 0.35 s after a cut reads low (the scan damps it)
  const S = smp.filter(q => q.t >= a0 && q.t < b0 && !q.cut); if(S.length < 8) return out;
  const at = (f: number) => { const c = a0 + f*L, w = 0.15*L; const W = S.filter(q => Math.abs(q.t - c) <= w); return W.length ? W.reduce((x, q) => x + q.m, 0)/W.length : null; };
  const mk = [0, 0.25, 0.5, 0.75, 1].map(at);
  if(freeze !== null && freeze >= 0.15 && freeze <= 0.9){
    const before = S.filter(q => q.t < a + freeze*(b - a)), after = S.filter(q => q.t > a + (freeze + 0.05)*(b - a)), avg = (x: Any[]) => x.length ? x.reduce((u, q) => u + q.m, 0)/x.length : 0;
    if(after.length >= 2 && avg(before) >= 0.2*mMax && avg(after) <= 0.03*mMax) { out.frz = +freeze.toFixed(2); return out; }
  }
  if(mk.some(x => x === null)) return out;
  const m5 = mk as number[], hi = Math.max(...m5), mean = m5.reduce((x, y) => x + y, 0)/5; if(mean < 0.15*mMax) return out;
  const lo = Math.max(0.05*hi, Math.min(...m5)); if(hi/lo < 5) return out;   // a ramp is 3x against 0.5x (6x) or more; the action alone varies less
  const d = m5.slice(1).map((x, k) => Math.sign(Math.round((x - m5[k])/hi*10))), turns = d.filter((x, k) => k && x && d[k-1] && x !== d[k-1]).length;
  if(turns > 1) return out;   // up, down, up: the action, not a ramp
  const g = Math.exp(m5.reduce((x, y) => x + Math.log(Math.max(lo, y)), 0)/5);
  out.spd = m5.map(x => +Math.min(2.5, Math.max(0.35, Math.pow(Math.max(lo, x)/g, 0.8))).toFixed(2));
  return out;
}

/** What each side gives the reader of one Reel */
export interface ReelIo {
  dur: number;
  /** small frames (64 wide, the Reel's shape) at these times, in their order; null: none there */
  small: (ts: number[]) => Promise<(Pic | null)[]>;
  /** the colour look of the frame at each of these times (lookStats), null: none */
  looks: (ts: number[]) => Promise<(Look | null)[]>;
  /** the clip scan of the Reel (scanMotion on the website, ClipScan.kt on the phone) */
  scenes: Any[]; samples: Any[];
  /** its song read (songAnalysis), the beats, its sound map; describeCut (soundmap.ts, a copy on each side) */
  rb: number[] | null; rr: Any; rmap: Any; describeCut: (map: Any, a: number, b: number, o: Any) => Any;
  onP: (p: number, what: string) => void;
}

/** Everything read from the Reel's pictures and sound: its cuts, shots and moments, as the copy uses them */
export async function readReel(io: ReelIo){
  const { small, scenes, samples, rb, rr, rmap, onP } = io, dur = io.dur;
  let refPanels: Any[] = []; const fxOdd: Any[] = [], shots: Any[] = [], looks: Look[] = [];   // fxOdd: effects in a shot this reader does not learn (the learning log)
  let cuts: Any[] = [];
  try{
    // black bars (letterbox): the rows that stay dark in every one of 12 frames
    refBars = null;
    refBars = letterboxOf(await small(Array.from({ length: 12 }, (_, i) => Math.min(dur - 0.05, (i + 0.5)*dur/12))));
    // every frame: the hard cuts to the frame and the flickers; the scene reading adds its fades, dissolves and the
    // cuts hidden in a moving transition (a whip's blur)
    const fc = await frameCuts(small, dur, p => onP(0.4 + 0.1*p, 'finding every cut'));
    refPanels = fc.panels || [];   // panels: pieces of the frame that change one after another (refCopy.ts)
    const inFl = (t: number) => fc.flicker.some(f => t > f.t0 - 0.05 && t < f.t1 + 0.05);
    const found: Any[] = fc.cuts.filter(t => t > 0.08 && t < dur - 0.1).map(t => ({ t, hint: 'cut', exact: true }));
    // a cut: its first new frame; a fade / flash: its darkest / brightest moment; a dissolve: its middle
    for(const sc of scenes || []){ const t = sc.kind === 'cut' ? sc.t1 : sc.tc !== undefined ? sc.tc : (sc.t0 + sc.t1)/2;
      if(t <= 0.15 || t >= dur - 0.15 || inFl(t)) continue;
      const near = found.findIndex(c => Math.abs(c.t - t) < (sc.kind === 'cut' ? 0.1 : 0.2));
      if(near < 0) found.push({ t, hint: sc.kind }); else if(sc.kind !== 'cut') found[near] = { t, hint: sc.kind, exact: found[near].exact }; }
    // a shot that goes soft into another shot (a blur-through): no frame of it jumps
    for(const t of fc.blurs) if(t > 0.15 && t < dur - 0.15 && !inFl(t) && !found.some(c => Math.abs(c.t - t) < 0.3)) found.push({ t, hint: 'cut' });
    // a flicker is one shot of its own (from its first to its last jump): cuts at both of its ends
    fc.flicker.forEach(f => { if(f.t0 > 0.08) found.push({ t: f.t0, hint: 'cut', flick: true }); if(f.t1 < dur - 0.1) found.push({ t: f.t1, hint: 'cut', flickEnd: true }); });
    found.sort((a,b)=>a.t-b.t);
    cuts = found.filter((c,i) => !i || c.t - found[i-1].t > 0.05);
    const flicks = fc.flicker;
    // what happens at each cut: the frames around it, decoded in one pass
    onP(0.5, 'reading its transitions');
    const ts: number[] = []; cuts.forEach(c=>{ for(let k=-CUT_K;k<=CUT_K;k++) ts.push(Math.min(Math.max(0.005, c.t + k/30 + 0.005), dur-0.02)); });
    const frames = ts.length ? await small(ts) : [];
    cuts.forEach((c,i)=>{ const cv = frames.slice(i*(2*CUT_K+1), (i+1)*(2*CUT_K+1)), fr = cutFramesOf(cv);
      const at = (k: number) => fr.find((f: Any)=>f.k===k);
      // a spin: the picture turns over the frames before the cut
      { let cw = 0, ccw = 0; for(let k=-4;k<0;k++){ const a = at(k), b = at(k+1); if(!a || !b) continue; const r = motionBetween(a.Y, b.Y, a.FW, a.FH).r; if(r >= 6) cw++; else if(r <= -6) ccw++; }
        fr.spin = Math.max(cw, ccw) >= 2; }   // turned the same way on two frames or more
      // a glitch: red and blue pulled apart on two frames or more around the cut
      fr.glitch = cv.slice(CUT_K-3, CUT_K+4).filter(x=>rgbShiftOf(x) >= 2).length >= 2;
      if(!c.exact && c.hint === 'fade'){ const mid = fr.filter((f: Any) => Math.abs(f.k) <= 3).map((f: Any) => f.mean); if(mid.length && Math.min(...mid) > 0.08 && Math.max(...mid) < 0.9) c.hint = 'cut'; }   // not dark (nor white) in its middle: not a fade
      c.kind = cutKind(fr, c.hint); if(fr.shiftTo) c.t += fr.shiftTo/30;
      { const af = fr.filter((f: Any) => f.k >= 3); c.after = af.length ? af.reduce((q: number,f: Any)=>q+f.mean,0)/af.length : 1; }   // how bright the next shot is
      // a reveal through a shape (circle, diamond, heart, star, wipe, bars): the frames in the middle of the transition
      const stepOf = (k: number) => { const a = at(k-1), b = at(k); if(!a || !b) return null; let s = 0; for(let q=0;q<a.Y.length;q++) s += Math.abs(a.Y[q]-b.Y[q]); return s/a.Y.length; };
      const steps: number[] = []; for(let k=-3;k<=4;k++){ const s = stepOf(k); if(s !== null) steps.push(s); } steps.sort((x,y)=>y-x);
      const oneStep = steps.length >= 4 && steps[0] > 3*Math.max(0.006, steps[1]); c.one = oneStep;
      // a clean one-frame jump is a hard cut: in a fast edit the frames around it hold other cuts (read as whips, wipes),
      // so a cut found on its frame is judged on its own step against the frames right next to it
      const s0 = stepOf(0), s1 = Math.max(stepOf(-1) ?? 0, stepOf(1) ?? 0);
      if(c.exact && s0 !== null && s0 > 1.5*Math.max(0.006, s1)) c.one = true;   // the next shot may start moving (blur): the cut is still the biggest step
      if(c.one && c.kind !== 'flash' && c.kind !== 'fade') c.kind = 'hard';
      if(c.flick || c.flickEnd) c.kind = 'hard';
      // how sharp the picture stays through the cut: a moving transition (a blur, a zoom or whip through) goes soft in
      // its middle frames; smoke drifting in, a car rolling past posts or a slide inside one shot stays sharp
      const sharpOf = (f: Any) => { const Y = f.Y, W2 = f.FW; let s2 = 0, n2 = 0; for(let q=0; q+W2+1<Y.length; q+=2){ s2 += Math.abs(Y[q+1]-Y[q]) + Math.abs(Y[q+W2]-Y[q]); n2++; } return n2 ? s2/n2 : 0; };
      const shA = fr.filter((f: Any) => f.k <= -5).map(sharpOf), shB = fr.filter((f: Any) => f.k >= 5).map(sharpOf), shM = fr.filter((f: Any) => Math.abs(f.k) <= 3).map(sharpOf);
      const avg = (a: number[]) => a.length ? a.reduce((q,x)=>q+x,0)/a.length : 0, ends = Math.min(avg(shA), avg(shB));
      c.blurDip = ends > 0.004 && shM.length ? Math.min(...shM)/ends : 1;
      // a cut only the scene reading found (no jump on one frame): kept when it goes soft (a moving transition), dropped
      // when it stays sharp (something moved inside the shot); fades and dissolves keep their own reading
      if(!c.exact && !c.flick && !c.flickEnd && c.hint === 'cut'){ if(c.blurDip >= 0.65) c.drop = true; else if(!['whip','zoom','spin','flash','glitch','fade'].includes(c.kind)) c.kind = 'blur';
        if(c.kind === 'spin' && fr.some((f: Any) => Math.abs(f.k) <= 4 && f.mean > 0.9)) c.kind = 'flash'; }   // into plain white: nothing turns
      if(['hard','dissolve'].includes(c.kind) && !c.one){ const A = at(-CUT_K), B = at(CUT_K);
        if(A && B) for(const k of [0,-1,1,-2,2,-3,3]){ const F = at(k); if(!F) continue; const sh = revealShape(A.Y, B.Y, F.Y, A.FW, A.FH); if(sh){ c.kind = sh; break; } } }
      c.odd = oddCut(fr, c, at);
      // a coloured flash (orange, red, yellow light over the picture) is a light leak / film burn
      if(c.kind === 'flash'){ const w = cv.map(x => x ? warmOf(x.data as Any) : null), side = [...w.slice(0, 2), ...w.slice(-2)].filter(x => x !== null) as number[], mid = w.slice(CUT_K-5, CUT_K+6).filter(x => x !== null) as number[];
        if(side.length && mid.length && Math.max(...mid) - Math.max(...side) > 0.16) c.odd = { guess: 'light leak / film burn', ours: 'burn', sig: 'a warm flash' }; } });
    for(let i=cuts.length-1;i>=0;i--) if(cuts[i].drop) cuts.splice(i, 1);
    // a flash moves its cut onto its brightest frame: in time order again, never two on the same frame
    cuts.sort((x, y) => x.t - y.t);
    for(let i=cuts.length-1;i>0;i--) if(cuts[i].t - cuts[i-1].t < 1.5/30){ if(cuts[i].kind !== 'hard' && cuts[i-1].kind === 'hard') cuts[i-1].kind = cuts[i].kind; cuts.splice(i, 1); }
    joinFlashes(cuts);
    // a cut to a plain white (or black) screen and the next picture fading in from it within 0.8 s: one transition (a
    // fade through white / black), not two cuts around a white shot
    for(let i=cuts.length-1;i>0;i--){ const a = cuts[i-1], b = cuts[i], white = a.after > 0.88, black = a.after < 0.05;
      if(b.t - a.t <= 0.8 && (white || black) && !(b.exact && b.kind === 'hard')){ a.kind = white ? 'flash' : 'fade'; cuts.splice(i, 1); } }
    // two cuts under 0.2 s apart are one moving transition (a whip's first blurred frames read as a cut of their own),
    // unless both are clean one-frame jumps (a strobe of hard cuts)
    for(let i=cuts.length-1;i>0;i--){ const a = cuts[i-1], b = cuts[i];
      if(b.t - a.t < 0.2 && !a.one && !b.one && !(a.exact && b.exact) && !a.flick && !b.flick && !a.flickEnd && !b.flickEnd){ if(b.kind === 'hard' && a.kind !== 'hard') b.kind = a.kind; else if(b.kind === 'hard' && !a.one) b.kind = 'whip'; cuts.splice(i-1, 1); } }
    cuts.forEach(c=>{ if(c.kind === 'zoom' && (c.blurDip ?? 1) < 0.65) c.zb = true; delete c.one; delete c.flick; delete c.flickEnd; delete c.exact; delete c.blurDip; });   // a soft zoom: zoom blur   // (c.after stays: the black end)
    // shots: a zoom inside them (two frames) and the colour look (the middle frame)
    onP(0.85, 'reading its look');
    const bounds = [0, ...cuts.map(c=>c.t), dur], sh: Any[] = [];
    for(let i=0;i<bounds.length-1 && i<200;i++) sh.push({ a: bounds[i], b: bounds[i+1], flick: flicks.some(f => Math.abs(f.t0 - bounds[i]) < 0.06 && Math.abs(f.t1 - bounds[i+1]) < 0.06) });
    const zt: number[] = [], zi: number[][] = [], lt: (number | null)[] = [];
    // the camera move: frames every ~0.12 s inside the shot (clear of its transitions), at most 9; short shots are not judged
    const lookEvery = Math.max(1, Math.ceil(sh.length/24));   // the colour look: 24 shots are plenty
    sh.forEach((x,i)=>{ const L = x.b - x.a, m = Math.min(0.25, Math.max(0.18, 0.15*L)), n = !x.flick && L - 2*m >= 0.24 ? Math.max(3, Math.min(9, Math.round((L-2*m)/0.12)+1)) : 0;
      for(let k=0;k<n;k++){ const t = x.a + m + (L-2*m)*k/(n-1); zt.push(t); zi.push([i, (t - x.a)/L]); } lt.push(!x.flick && i % lookEvery === 0 ? x.a + 0.5*L : null); });
    const zf = await small(zt), lq = lt.filter(t => t !== null) as number[], lr = lq.length ? await io.looks(lq) : [], lf: (Look | null)[] = []; { let q = 0; lt.forEach((t,i)=>{ lf[i] = t === null ? null : lr[q++]; }); }
    sh.forEach((x,i)=>{ const mine = zi.map((z,k)=>[z,k] as [number[], number]).filter(([z])=>z[0]===i), gr = mine.map(([,k])=>zf[k] ? greyOf(zf[k] as Pic) : null);
      let move: Any = null;
      if(gr.length >= 3 && gr.every(Boolean)) move = shotMove(gr.map(g=>g!.Y), mine.map(([z])=>z[1]), gr[0]!.FW, gr[0]!.FH);
      // held tilted: most of its frames turned by about the same angle
      const tl = gr.map(g => g ? tiltOf(g) : null).filter((t): t is number => t !== null).sort((p, q) => p - q);
      const tilt = tl.length >= 2 && tl.length * 2 >= gr.length && tl[tl.length-1] - tl[0] < 3 ? Math.round(tl[tl.length >> 1] * 2) / 2 : null;
      shots.push({ a: x.a, b: x.b, zoom: move ? (move.zoom === 'in' ? 1.06 : move.zoom === 'out' ? 0.94 : 1) : 1, move, flick: x.flick, sat: satOfPics(mine.map(([,k]) => zf[k] as Pic | null)), tilt });
      const lk = lf[i]; if(lk) looks.push(lk);
      // the learning log: an effect in the shot the styles do not learn yet (the studio has each of these)
      if(!x.flick){ const cv = mine.map(([,k]) => zf[k]).filter(Boolean), found: string[][] = [];
        if(cv.filter(c => rgbShiftOf(c) >= 2).length >= 2) found.push(['RGB split in the shot', 'rgbpulse']);
        const sym = (g: Any) => { const Y = g.Y, W2 = g.FW; let s2 = 0, n2 = 0; for(let q=0; q<Y.length; q+=3){ const xq = q % W2; s2 += Math.abs(Y[q] - Y[q - xq + (W2-1-xq)]); n2++; } return n2 ? s2/n2 : 1; };
        if(gr.filter(g => g && sym(g) < 0.015).length >= 2) found.push(['mirror', 'mirror']);
        const bs = (samples || []).filter(q => q.t >= x.a + 0.07 && q.t < x.b - 0.07).map(q => q.b);
        if(bs.length >= 6){ const md = [...bs].sort((p,q)=>p-q)[bs.length>>1]; if(bs.filter(b => b > md + 0.25).length >= 2) found.push(['strobe / flash pulses', 'strobe']); }
        // a light leak passing over the shot: some of its frames clearly brighter AND warmer than the rest, not all of them
        // (a strobe is several sharp white spikes; a shot that is simply warm is its look)
        if(!found.some(f => f[1] === 'strobe') && cv.length >= 3){
          const br = cv.map((p: Any) => { const d = p.data; let s3 = 0, n3 = 0; for(let q=0;q+3<d.length;q+=16){ s3 += d[q] + d[q+1] + d[q+2]; n3++; } return n3 ? s3/n3/765 : 0; }), wm = cv.map((p: Any) => warmOf(p.data));
          const mid = (a: number[]) => [...a].sort((p,q)=>p-q)[a.length>>1], mb = mid(br), mw = mid(wm), hot = br.map((b2: number, k: number) => b2 > mb + 0.12 && wm[k] > mw + 0.05).filter(Boolean).length;
          if(hot >= 1 && hot * 2 <= cv.length) found.push(['light leak in the shot', 'leak']); }
        found.forEach(([guess, ours]) => fxOdd.push({ at: +x.a.toFixed(2), guess, ours })); } });
  } finally { refBars = null; }
  // pace
  const P = rb ? (()=>{ const ib = rb.slice(1).map((t,i)=>t-rb[i]).sort((x,y)=>x-y); return ib[ib.length>>1]; })() : 0;
  const shotSec = shots.map(s=>s.b-s.a), toBeats = (x: number) => P ? Math.max(0.5, Math.round(x/P*2)/2) : 0;
  const shotBeats = P ? shotSec.map(toBeats) : [];
  const onBeat = rb && cuts.length ? cuts.filter(c=>rb.some(b=>Math.abs(b-c.t) <= 0.07)).length/cuts.length : 0;
  const med = (a: number[]) => { const q=[...a].sort((x,y)=>x-y); return q.length ? q[q.length>>1] : 0; };
  const k3 = Math.max(1, Math.floor(shotSec.length/3)), first = shotSec.slice(0,k3), last = shotSec.slice(-k3), mean = (a: number[]) => a.reduce((q,x)=>q+x,0)/Math.max(1,a.length);
  const energy = shotSec.length < 6 ? 'steady' : mean(last) < 0.75*mean(first) ? 'rising' : mean(last) > 1.33*mean(first) ? 'falling' : 'steady';
  const trans: Record<string, number> = {}; cuts.forEach(c=>{ trans[c.kind] = (trans[c.kind]||0) + 1; });
  Object.keys(trans).forEach(k=>{ trans[k] /= cuts.length; });
  const look = avgLook(looks);
  const drops = rr ? (rr.cuts || []).filter((c: Any,k: number)=>rr.cutType[k] === 'drop') : [];
  // what each shot shows, for picking the creator's moments like it (scoreWindow): how much moves in it (0-1, against
  // the Reel's busiest shot) and how bright it is; the frames at its cuts are left out (a cut is all change)
  const smp = samples || [], shotStat = shots.map(s => { let m = 0, b = 0, n = 0;
    for(const q of smp){ if(q.t >= s.a + 0.07 && q.t < s.b - 0.07){ m += q.m; b += q.b; n++; } } return n ? { m: m/n, b: b/n } : null; });
  const mMax = Math.max(1e-6, ...shotStat.map(x => x ? x.m : 0));
  // black-and-white shots in a Reel in colour (most shots coloured, this one grey); a Reel all in grey is its look's
  { const ss = shots.map(s => s.sat).filter((x: Any) => x !== null).sort((a: number, b: number) => a - b), md = ss.length ? ss[ss.length >> 1] : 0;
    if(md > 0.12) shots.forEach(s => { if(s.sat !== null && s.sat < 0.04 && !s.flick) s.mono = true; }); }
  const moments = shots.slice(0, 200).map((s,i)=>{
    const mm: Any = { beats: shotBeats[i] || 0, sec: +shotSec[i].toFixed(3), at: +s.a.toFixed(3), tr: i ? (cuts[i-1] ? cuts[i-1].kind : 'hard') : 'start', zoom: s.zoom > 1.03 ? 'in' : s.zoom < 0.97 ? 'out' : 'none' };
    if(s.flick) mm.flick = true;
    // a transition or an effect the reader knows only by its look, one the studio has: copied too (refCopy.ts)
    if(i && cuts[i-1] && cuts[i-1].odd && REF_TRX.includes(cuts[i-1].odd.ours)) mm.trx = cuts[i-1].odd.ours;
    if(i && cuts[i-1] && cuts[i-1].zb) mm.trx = 'zoomblur';
    // a black-and-white shot in a Reel in colour (the studio's per-shot B&W, cs.sat -1)
    if(s.mono) mm.mono = true;
    // a shot held tilted, its corners showing (degrees, clockwise positive)
    if(s.tilt !== null && s.tilt !== undefined && !s.flick) mm.tilt = s.tilt;
    // panels: the shot a build opens (it starts within the build or just after it)
    if(i && !s.flick){ const pb = refPanels.find(b => s.a >= b.t0 - 0.2 && s.a <= b.t1 + 0.6); if(pb && pb.kind !== 'boxes') mm.trx = pb.kind; }
    { const f = fxOdd.find(x => Math.abs(x.at - s.a) < 0.02 && REF_FX.includes(x.ours)); if(f && !s.flick) mm.fx = f.ours; }
    const st = shotStat[i];
    if(st && !s.flick){ mm.mo = +(st.m/mMax).toFixed(3); mm.br = +st.b.toFixed(3);
      const sp = refSpeedOf(smp, s.a, s.b, mMax, s.move ? s.move.freeze : null); if(sp.spd) mm.spd = sp.spd; if(sp.frz !== undefined) mm.frz = sp.frz; }
    // the Reel ends on black (an end card: a logo on black): the copy ends on black too
    if(i === shots.length - 1 && i > 0 && cuts[i-1] && cuts[i-1].after < 0.06 && s.b - s.a >= 0.8) mm.black = true;
    if(s.move){ if(s.move.keys.length >= 2 && (s.move.zoom !== 'none' || s.move.keys.some((k: Any)=>Math.abs(k.x) > 0.02 || Math.abs(k.y) > 0.02 || Math.abs(k.r) >= 2))){ mm.move = s.move.keys; mm.ease = s.move.ease; }
      if(s.move.shake) mm.shake = true; if(s.move.freeze !== null) mm.freeze = +s.move.freeze.toFixed(2); }
    if(rmap && rr){ const dm = io.describeCut(rmap, s.a, s.b, { hits: rr.hitsRaw || [], hitStr: rr.hitsStr || [], drops, beats: rr.beats || [] });
      Object.assign(mm, { loud: dm.loud, trend: dm.trend, drums: dm.drums, bass: dm.bass, voice: dm.voice });
      if(dm.hits && dm.hits.length) mm.hit = dm.hits.slice().sort((x: Any,y: Any)=>y.p-x.p)[0].k;
      if(drops.some((d: number)=>Math.abs(d - s.a) < 0.15)) mm.drop = true; }
    return mm; });
  // the transition mix by what the copy makes: a cut seen by its look (a light leak, a zoom out, a panel build) counts as
  // that, not as a hard cut, so a learned style keeps it (before 2026-11-28 the Learning log had them "not known")
  for(const k of Object.keys(trans)) delete trans[k];
  cuts.forEach((c, i) => { const m = moments[i + 1], k = (m && m.trx) || c.kind; trans[k] = (trans[k] || 0) + 1; });
  Object.keys(trans).forEach(k=>{ trans[k] /= cuts.length; });
  // the effects in its shots (RGB split, mirror, strobe): the share of shots with each
  const fx: Record<string, number> = {}; moments.forEach(m => { if(m.fx) fx[m.fx] = (fx[m.fx] || 0) + 1 / moments.length; });
  return { dur, moments, fx, cuts: cuts.map(c=>({t:+c.t.toFixed(3), kind:c.kind})), shotSec, shotBeats, medianBeats: med(shotBeats), medianSec: med(shotSec),
    hookBeats: shotBeats[0] || 0, hookSec: shotSec[0] || 0, onBeat, energy, trans,
    zoomShare: shots.filter(s=>s.b-s.a >= 0.9 && (s.zoom >= 1.05 || s.zoom <= 0.95)).length/Math.max(1, shots.filter(s=>s.b-s.a >= 0.9).length),   // of the shots long enough to judge
    look, bpm: P ? 60/P : 0,
    // photo boxes over its shots (boxes.ts): the copy gets them on its own long shots
    boxes: refPanels.filter(b => b.kind === 'boxes').map(b => ({ t0: b.t0, t1: b.t1 })),
    // the learning log: what this reader could not learn (a transition it does not know; an effect in a shot)
    // (one the studio has and copies is known: only what it lacks is left here)
    unread: { cuts: cuts.filter(c => c.odd && !REF_TRX.includes(c.odd.ours)).map(c => ({ at: +c.t.toFixed(2), ...c.odd })), fx: fxOdd.filter((x: Any) => !REF_FX.includes(x.ours)) } };
}
