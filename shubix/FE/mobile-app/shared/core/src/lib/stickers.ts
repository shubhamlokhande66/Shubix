/** Shubix's own stickers: vector shapes (SVG path data in a 100 x 100 box, filled even-odd so rings and faces have holes),
 * drawn the same on the website, the phone and in the export, with no emoji font and no licence to show. Each has its own
 * colour; the creator or Shubix AI can give it another. A sticker is an overlay with `emoji: true` and `stk: <key>`. */
export type Sticker = { name: string; cat: "Point" | "Highlight" | "Mood" | "Social" | "Shop"; d: string; color: string };

const circ = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const star = (n: number, ro: number, ri: number) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? ri : ro, a = (Math.PI * i) / n - Math.PI / 2; return `${i ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`; }).join("") + "z";

export const STICKERS: Record<string, Sticker> = {
  arrow: { name: "Arrow", cat: "Point", color: "#FFD54A", d: "M8 38h52V18l34 32-34 32V62H8z" },
  arrowdown: { name: "Arrow down", cat: "Point", color: "#FFD54A", d: "M38 6h24v50h20L50 94 18 56h20z" },
  curve: { name: "Curved arrow", cat: "Point", color: "#FFFFFF", d: "M14 84C14 46 38 26 66 26V10l28 26-28 26V46C46 46 34 58 32 84z" },
  pin: { name: "Location", cat: "Point", color: "#FF4D4D", d: "M50 4C31 4 17 18 17 37c0 25 33 59 33 59s33-34 33-59C83 18 69 4 50 4z" + circ(50, 36, 12) },
  ring: { name: "Circle", cat: "Highlight", color: "#FF4D4D", d: circ(50, 50, 45) + circ(50, 50, 36) },
  scribble: { name: "Underline", cat: "Highlight", color: "#FFD54A", d: "M4 64c22-12 46-14 68-9 9 2 16 1 23-3l3 10c-9 6-19 7-29 5-20-4-40-2-60 8z" },
  burst: { name: "Burst", cat: "Highlight", color: "#FFD54A", d: star(12, 48, 34) },
  sparkle: { name: "Sparkle", cat: "Highlight", color: "#FFFFFF", d: "M50 2C54 34 66 46 98 50 66 54 54 66 50 98 46 66 34 54 2 50 34 46 46 34 50 2z" },
  star: { name: "Star", cat: "Highlight", color: "#FFD54A", d: star(5, 47, 19) },
  bolt: { name: "Lightning", cat: "Highlight", color: "#FFD54A", d: "M60 2L16 56h28l-10 42 50-58H56z" },
  exclaim: { name: "Wow!", cat: "Highlight", color: "#FF4D4D", d: "M38 4h24l-5 62H43z" + circ(50, 84, 11) },
  heart: { name: "Heart", cat: "Mood", color: "#FF3B6B", d: "M50 90C19 67 5 51 5 32 5 17 17 7 30 7c9 0 16 5 20 12 4-7 11-12 20-12 13 0 25 10 25 25 0 19-14 35-45 58z" },
  fire: { name: "Fire", cat: "Mood", color: "#FF7A1A", d: "M54 2c6 20-12 28-12 46 0 7 3 12 7 15-11-2-19-12-18-25C20 48 14 60 14 72c0 17 15 26 36 26s36-10 36-29c0-27-26-42-32-67z" },
  smile: { name: "Smile", cat: "Mood", color: "#FFD54A", d: circ(50, 50, 46) + circ(34, 38, 7) + circ(66, 38, 7) + "M24 56h52c-2 17-12 28-26 28S26 73 24 56z" },
  check: { name: "Tick", cat: "Mood", color: "#2BD576", d: "M6 52l15-15 19 19L79 17l15 15-54 54z" },
  cross: { name: "Cross", cat: "Mood", color: "#FF4D4D", d: "M22 6l28 28L78 6l16 16-28 28 28 28-16 16-28-28-28 28L6 78l28-28L6 22z" },
  question: { name: "Question", cat: "Mood", color: "#FFFFFF", d: "M26 32C26 15 37 4 52 4s26 10 26 24c0 12-8 19-15 23-5 3-6 6-6 12v4H41v-6c0-11 4-16 12-21 6-4 9-7 9-13 0-6-4-10-10-10-7 0-11 5-11 15z" + circ(49, 86, 10) },
  bubble: { name: "Speech", cat: "Social", color: "#FFFFFF", d: "M14 8h72a10 10 0 0 1 10 10v46a10 10 0 0 1-10 10H46L22 94V74h-8A10 10 0 0 1 4 64V18A10 10 0 0 1 14 8z" },
  play: { name: "Play", cat: "Social", color: "#FF2D2D", d: circ(50, 50, 46) + "M39 29v42l33-21z" },
  bell: { name: "Bell", cat: "Social", color: "#FFD54A", d: "M50 4c-4 0-7 3-7 7v3C29 18 21 30 21 46v18L10 78h80L79 64V46c0-16-8-28-22-32v-3c0-4-3-7-7-7z" + "M38 84a12 12 0 0 0 24 0z" },
  note: { name: "Music", cat: "Social", color: "#FFFFFF", d: "M36 16l52-12v62a13 13 0 1 1-9-12V26L45 34v44a13 13 0 1 1-9-12z" },
  crown: { name: "Crown", cat: "Shop", color: "#FFD54A", d: "M6 28l23 20 21-36 21 36 23-20-9 54H15zM15 86h70v9H15z" },
  tag: { name: "Price tag", cat: "Shop", color: "#FFD54A", d: "M4 50L38 16h50a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H38z" + circ(28, 50, 7) },
  new: { name: "New badge", cat: "Shop", color: "#FF4D4D", d: star(16, 48, 40) },
};
export const STICKER_KEYS = Object.keys(STICKERS);
