/** HEIC photos (iPhones, some Android phones) opened with no library and no licence: the file's boxes are read here (ISO
 * 23008-12) and its HEVC pictures go to the browser's own video decoder (WebCodecs). Chrome and Edge have one wherever the
 * computer or phone decodes HEVC; Safari opens HEIC by itself. Where neither can, this throws and the photo is named. */

type Box = { type: string; at: number; end: number };
type Extent = { at: number; len: number };
export type HeicTile = { data: Uint8Array };
export type Heic = {
  /** the whole picture, before it is turned */
  w: number; h: number; tileW: number; tileH: number; cols: number; rows: number; tiles: HeicTile[];
  /** the decoder's set-up (hvcC), as it is in the file */
  hvcC: Uint8Array;
  /** what to do to the picture afterwards, in order: quarter turns anticlockwise, or a mirror (`v`: top to bottom) */
  turns: ({ rot: number } | { mirror: "v" | "h" })[];
  color: { matrix: number; full: boolean; primaries: number; transfer: number } | null;
};

export const isHeicFile = (f: { name: string; type?: string }) => /\.hei[cf]$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type ?? "");

/** the file's boxes -> its main picture's tiles and how to put them together; throws when it is not a HEIC we can read */
export function parseHeic(bytes: Uint8Array): Heic {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (p: number) => String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
  const num = (p: number, n: number) => { let x = 0; for (let i = 0; i < n; i++) x = x * 256 + v.getUint8(p + i); return x; };
  const boxes = (a: number, end: number): Box[] => {
    const out: Box[] = [];
    for (let p = a; p + 8 <= end; ) {
      let size = v.getUint32(p), head = 8;
      if (size === 1) { size = num(p + 8, 8); head = 16; } else if (size === 0) size = end - p;
      if (size < head || p + size > end) break;
      out.push({ type: str(p + 4), at: p + head, end: p + size }); p += size;
    }
    return out;
  };
  const need = (list: Box[], type: string) => { const b = list.find((x) => x.type === type); if (!b) throw new Error(`HEIC: no ${type}`); return b; };

  const meta = need(boxes(0, bytes.length), "meta"), M = boxes(meta.at + 4, meta.end);
  const pitm = need(M, "pitm"), primary = num(pitm.at + 4, v.getUint8(pitm.at) ? 4 : 2);

  const kinds = new Map<number, string>(), iinf = need(M, "iinf");
  for (const b of boxes(iinf.at + 4 + (v.getUint8(iinf.at) ? 4 : 2), iinf.end)) {
    const ver = v.getUint8(b.at); if (b.type !== "infe" || ver < 2) continue;
    const wide = ver === 3 ? 4 : 2; kinds.set(num(b.at + 4, wide), str(b.at + 4 + wide + 2));
  }

  const places = new Map<number, { how: number; parts: Extent[] }>(), iloc = need(M, "iloc");
  {
    const ver = v.getUint8(iloc.at), a = v.getUint8(iloc.at + 4), c = v.getUint8(iloc.at + 5);
    const offN = a >> 4, lenN = a & 15, baseN = c >> 4, idxN = ver ? c & 15 : 0, idN = ver === 2 ? 4 : 2;
    let p = iloc.at + 6; const count = num(p, idN); p += idN;
    for (let i = 0; i < count; i++) {
      const id = num(p, idN); p += idN;
      let how = 0; if (ver) { how = num(p, 2) & 15; p += 2; }
      p += 2; const base = num(p, baseN); p += baseN;
      const n = num(p, 2); p += 2; const parts: Extent[] = [];
      for (let k = 0; k < n; k++) { p += idxN; const at = num(p, offN); p += offN; const len = num(p, lenN); p += lenN; parts.push({ at: base + at, len }); }
      places.set(id, { how, parts });
    }
  }
  const idat = M.find((b) => b.type === "idat");
  const dataOf = (id: number) => {
    const pl = places.get(id); if (!pl || pl.how > 1) throw new Error("HEIC: no picture data");
    const shift = pl.how === 1 ? (idat ?? need(M, "idat")).at : 0;
    const total = pl.parts.reduce((n, x) => n + x.len, 0), out = new Uint8Array(total); let o = 0;
    for (const x of pl.parts) { const from = shift + x.at; if (from + x.len > bytes.length) throw new Error("HEIC: the file is cut short"); out.set(bytes.subarray(from, from + x.len), o); o += x.len; }
    return out;
  };

  const iprp = boxes(need(M, "iprp").at, need(M, "iprp").end), props = boxes(need(iprp, "ipco").at, need(iprp, "ipco").end), has = new Map<number, Box[]>();
  for (const b of iprp.filter((x) => x.type === "ipma")) {
    const ver = v.getUint8(b.at), big = v.getUint8(b.at + 3) & 1; let p = b.at + 4; const n = num(p, 4); p += 4;
    for (let i = 0; i < n; i++) {
      const id = num(p, ver ? 4 : 2); p += ver ? 4 : 2; const c = v.getUint8(p++), list: Box[] = [];
      for (let k = 0; k < c; k++) { const x = big ? num(p, 2) & 0x7fff : v.getUint8(p) & 0x7f; p += big ? 2 : 1; if (x && props[x - 1]) list.push(props[x - 1]); }
      has.set(id, list);
    }
  }
  const sizeOf = (id: number) => { const b = need(has.get(id) ?? [], "ispe"); return { w: num(b.at + 4, 4), h: num(b.at + 8, 4) }; };

  let ids = [primary], cols = 1, rows = 1, { w, h } = sizeOf(primary);
  if (kinds.get(primary) === "grid") {
    const g = dataOf(primary), big = g[1] & 1, gv = new DataView(g.buffer);
    rows = g[2] + 1; cols = g[3] + 1; w = big ? gv.getUint32(4) : gv.getUint16(4); h = big ? gv.getUint32(8) : gv.getUint16(6);
    const iref = need(M, "iref"), wide = v.getUint8(iref.at) ? 4 : 2;
    const d = boxes(iref.at + 4, iref.end).find((b) => b.type === "dimg" && num(b.at, wide) === primary);
    if (!d) throw new Error("HEIC: no tiles");
    ids = Array.from({ length: num(d.at + wide, 2) }, (_, k) => num(d.at + wide + 2 + k * wide, wide));
    if (ids.length < cols * rows) throw new Error("HEIC: tiles missing");
    ids = ids.slice(0, cols * rows);
  }
  if (!ids.every((id) => kinds.get(id) === "hvc1")) throw new Error("HEIC: not an HEVC picture");
  const tile = sizeOf(ids[0]), conf = need(has.get(ids[0]) ?? [], "hvcC");
  const turns: Heic["turns"] = [];
  let color: Heic["color"] = null;
  for (const b of has.get(primary) ?? []) {
    if (b.type === "irot") turns.push({ rot: v.getUint8(b.at) & 3 });
    else if (b.type === "imir") turns.push({ mirror: v.getUint8(b.at) & 1 ? "h" : "v" });
  }
  for (const b of [...(has.get(primary) ?? []), ...(has.get(ids[0]) ?? [])])
    if (!color && b.type === "colr" && str(b.at) === "nclx") color = { primaries: num(b.at + 4, 2), transfer: num(b.at + 6, 2), matrix: num(b.at + 8, 2), full: v.getUint8(b.at + 10) >> 7 === 1 };
  return { w, h, tileW: tile.w, tileH: tile.h, cols, rows, tiles: ids.map((id) => ({ data: dataOf(id) })), hvcC: bytes.slice(conf.at, conf.end), turns, color };
}

/** the decoder's name for this stream (ISO 14496-15): the file's own, then plain Main (phones write "Main Still Picture",
 * which is Main with one frame, and many decoders know only Main) */
export function hevcCodecs(c: Uint8Array): string[] {
  const space = ["", "A", "B", "C"][c[1] >> 6], tier = c[1] & 32 ? "H" : "L", profile = c[1] & 31, level = c[12];
  let compat = 0; const raw = new DataView(c.buffer, c.byteOffset).getUint32(2);
  for (let i = 0; i < 32; i++) if (raw & (1 << i)) compat |= 1 << (31 - i);
  const cons = [...c.slice(6, 12)]; while (cons.length && !cons[cons.length - 1]) cons.pop();
  const own = `hvc1.${space}${profile}.${(compat >>> 0).toString(16).toUpperCase()}.${tier}${level}${cons.map((x) => "." + x.toString(16).toUpperCase()).join("")}`;
  return [own, profile === 2 ? `hvc1.2.4.L${level}.B0` : `hvc1.1.6.L${level}.B0`, profile === 2 ? "hvc1.2.4.L186.B0" : "hvc1.1.6.L186.B0"];
}

const MATRIX: Record<number, VideoMatrixCoefficients> = { 1: "bt709", 5: "bt470bg", 6: "smpte170m" };

/** a HEIC photo as a canvas, upright */
export async function heicToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  if (typeof VideoDecoder === "undefined") throw new Error("HEIC: this browser has no video decoder");
  const p = parseHeic(new Uint8Array(await file.arrayBuffer()));
  const base = { codedWidth: p.tileW, codedHeight: p.tileH, description: p.hvcC, optimizeForLatency: true,
    colorSpace: { matrix: MATRIX[p.color?.matrix ?? 6] ?? "smpte170m", primaries: "bt709" as const, transfer: "iec61966-2-1" as const, fullRange: p.color?.full ?? true } };
  const canvas = document.createElement("canvas"); canvas.width = p.w; canvas.height = p.h;
  const g = canvas.getContext("2d"); if (!g) throw new Error("HEIC: no canvas");
  let last: unknown = new Error("HEIC: this device cannot decode HEVC");
  for (const codec of [...new Set(hevcCodecs(p.hvcC))]) {
    const config = { ...base, codec };
    const ok = await VideoDecoder.isConfigSupported(config).then((r) => r.supported, () => false);
    if (!ok) continue;
    try { await decodeTiles(p, config, g); return turned(canvas, p.turns); } catch (e) { last = e; }
  }
  throw last;
}

async function decodeTiles(p: Heic, config: VideoDecoderConfig, g: CanvasRenderingContext2D) {
  let drawn = 0, failed: unknown = null;
  const dec = new VideoDecoder({
    output: (f) => { const i = Math.round(f.timestamp / 1000); g.drawImage(f, (i % p.cols) * p.tileW, Math.floor(i / p.cols) * p.tileH, p.tileW, p.tileH); f.close(); drawn++; },
    error: (e) => { failed = e; },
  });
  try {
    dec.configure(config);
    p.tiles.forEach((t, i) => dec.decode(new EncodedVideoChunk({ type: "key", timestamp: i * 1000, data: t.data })));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([dec.flush(), new Promise((_, no) => { timer = setTimeout(() => no(new Error("HEIC: the decoder did not answer")), 20_000); })]); } finally { clearTimeout(timer); }
  } finally { if (dec.state !== "closed") dec.close(); }
  if (failed) throw failed;
  if (drawn < p.tiles.length) throw new Error("HEIC: some of the photo did not decode");
}

function turned(from: HTMLCanvasElement, turns: Heic["turns"]) {
  let c = from;
  for (const t of turns) {
    const quarter = "rot" in t && t.rot % 2 === 1, n = document.createElement("canvas");
    n.width = quarter ? c.height : c.width; n.height = quarter ? c.width : c.height;
    const g = n.getContext("2d")!; g.translate(n.width / 2, n.height / 2);
    if ("rot" in t) g.rotate(-t.rot * Math.PI / 2); else g.scale(t.mirror === "h" ? -1 : 1, t.mirror === "v" ? -1 : 1);
    g.drawImage(c, -c.width / 2, -c.height / 2); c = n;
  }
  return c;
}

/** a photo opened: by the browser when it can, a HEIC by the code above */
export async function openPhoto(file: File): Promise<ImageBitmap> {
  try { return await createImageBitmap(file); }
  catch (e) { if (!isHeicFile(file)) throw e; return createImageBitmap(await heicToCanvas(file)); }
}

/** the photo as a file an <img> can show: itself, or a HEIC as a JPEG where the browser shows no HEIC */
export async function showablePhoto(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  try { (await createImageBitmap(file)).close(); return file; } catch { /* not by itself */ }
  const c = await heicToCanvas(file), b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.95));
  if (!b) throw new Error("HEIC: no JPEG");
  return new File([b], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
}
