/** Small platform-neutral helpers. */
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
/** "sh••••@gmail.com" */
export const maskEmail = (s: string) => s.replace(/^([^@]{1,2})[^@]*(@.*)$/, (_m, a: string, b: string) => `${a}${"•".repeat(4)}${b}`);
/** "{email}" placeholders in a CMS text */
export const fill = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
/** A length as "1:05" (seconds in). */
export const clock = (s = 0) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
/** When something happened, said shortly: "just now", "5 min ago", "3 h ago", "2 d ago", else the date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return "";
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}
/** A file size as "4.2 MB" (whole MB from 10 MB). */
export const megabytes = (b: number) => (b < 1e7 ? (b / 1e6).toFixed(1) : String(Math.round(b / 1e6))) + " MB";
/** A video's quality: "720p", "1080p" or "4K", and its frame rate above 30 ("1080p · 60 fps"). */
export const videoQuality = (r: { width: number; height: number; fps: number }) => (Math.min(r.width, r.height) >= 2000 ? "4K" : Math.min(r.width, r.height) >= 1000 ? "1080p" : "720p") + (r.fps > 30 ? ` · ${r.fps} fps` : "");
/** An amount in rupees: "₹1,499". */
export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
/** The time left of a sale: "in 2 days", "in 5 h", "soon"; "" when it has no end or has ended. */
export function timeLeft(ends: string | null) {
  if (!ends) return "";
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3600_000), d = Math.floor(h / 24);
  return d >= 1 ? `in ${d} day${d > 1 ? "s" : ""}` : h >= 1 ? `in ${h} h` : "soon";
}

/** The words of an error that may be shown to people: our own messages are, but nothing from inside the app or the
 * phone (a file's path or address, a code error, a library's or the system's message, a server's details) is: that is
 * replaced by `fallback` (the full error still goes to the logs). Used by both apps' errorMessage. */
export function safeMessage(message: unknown, fallback = "Something went wrong. Please try again."): string {
  const m = typeof message === "string" ? message.trim() : "";
  if (!m || m.length > 300) return fallback;
  const inside = [
    /(file|content|blob|data):\/?\//i, /https?:\/\//i, /(^|[\s(])\/(data|storage|sdcard|var|tmp|private|Users|home|api|cache)\//i, /\b[A-Za-z]:\\/, // paths, addresses
    /\b[\w-]+\.(kt|java|ts|tsx|js|mjs|py|mp4|mov|m4a|wav|webm|onnx|json|db)\b/i,                                             // file names
    /\b(\w*Exception|\w*Error:|TypeError|ReferenceError|SyntaxError|RangeError|undefined|null pointer|NaN|stack trace)\b/,   // code errors
    /\bat [\w.$<>]+\s*\(/,                                                                                                   // a stack line
    /\b(java|kotlin|android|androidx|expo|mediabunny|onnx|ort|ffmpeg|mongo\w*|ECONN\w*|ENOENT|EACCES|ETIMEDOUT|ERR_\w+)\b/i, // libraries, system
    /\b(cannot read|is not a function|is not defined|unexpected token|failed to fetch|network request failed|load failed)\b/i,
    /[{}<>[\]]|\bstatus\s*\d{3}\b|\(\d{3}\)|\b0x[0-9a-f]+\b/i,                                                             // JSON, markup, codes
  ];
  return inside.some((re) => re.test(m)) ? fallback : m;
}
