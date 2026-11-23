/** a HEIC file put together for the tests: the same boxes a phone writes (tiles of HEVC, a grid, a turn) */
export function heicFile(o: { w: number; h: number; tileW: number; tileH: number; cols: number; rows: number; tiles: Uint8Array[]; hvcC: Uint8Array; rot?: number }): Uint8Array {
  const u = (n: number, b: number) => Array.from({ length: b }, (_, i) => Math.floor(n / 256 ** (b - 1 - i)) % 256);
  const s = (t: string) => [...t].map((c) => c.charCodeAt(0));
  const cat = (...a: ArrayLike<number>[]) => a.flatMap((x) => Array.from(x));
  const box = (t: string, ...body: ArrayLike<number>[]) => { const b = cat(...body); return cat(u(b.length + 8, 4), s(t), b); };
  const full = (t: string, v: number, f: number, ...body: ArrayLike<number>[]) => box(t, u(v, 1), u(f, 3), ...body);
  const grid = o.tiles.length > 1, n = o.tiles.length, main = grid ? n + 1 : 1, ids = o.tiles.map((_, i) => i + 1);
  const gridData = cat([0, 0, o.rows - 1, o.cols - 1], u(o.w, 2), u(o.h, 2));
  const infe = (id: number, t: string) => full("infe", 2, 0, u(id, 2), u(0, 2), s(t), [0]);
  const ispe = (w: number, h: number) => full("ispe", 0, 0, u(w, 4), u(h, 4));
  const props = [box("hvcC", o.hvcC), ispe(o.tileW, o.tileH), ...(grid ? [ispe(o.w, o.h)] : []), ...(o.rot === undefined ? [] : [box("irot", [o.rot])])];
  const turn = o.rot === undefined ? [] : [props.length | 0x80];
  const uses = [...ids.map((id) => ({ id, p: [1, 2, ...(grid ? [] : turn)] })), ...(grid ? [{ id: main, p: [3, ...turn] }] : [])];
  const ftyp = box("ftyp", s("heic"), u(0, 4), s("mif1heic"));
  const meta = (from: number) => {
    let at = from; const all = [...o.tiles, ...(grid ? [gridData] : [])];
    const loc = all.flatMap((d, i) => { const e = cat(u(i + 1, 2), u(0, 2), u(1, 2), u(at, 4), u(d.length, 4)); at += d.length; return e; });
    return full("meta", 0, 0, full("hdlr", 0, 0, u(0, 4), s("pict"), u(0, 13)), full("pitm", 0, 0, u(main, 2)),
      full("iinf", 0, 0, u(all.length, 2), ...ids.map((id) => infe(id, "hvc1")), ...(grid ? [infe(main, "grid")] : [])),
      full("iloc", 0, 0, [0x44, 0], u(all.length, 2), loc),
      ...(grid ? [full("iref", 0, 0, box("dimg", u(main, 2), u(n, 2), ...ids.map((id) => u(id, 2))))] : []),
      box("iprp", box("ipco", ...props), full("ipma", 0, 0, u(uses.length, 4), ...uses.map((x) => cat(u(x.id, 2), [x.p.length], x.p)))));
  };
  const head = ftyp.length + meta(0).length + 8;
  return Uint8Array.from(cat(ftyp, meta(head), box("mdat", ...o.tiles, ...(grid ? [gridData] : []))));
}
