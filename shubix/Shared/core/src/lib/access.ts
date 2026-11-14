/** Who may open which page before signing in (Administration → Settings → Sign-in rules). The legal and sign-in pages are
 * always open; the person's own pages (My Reels, account, admin…) always need an account; the rest the administrator
 * chooses. In the studio, Generate Reel always needs an account (free or paid): the song and clips are kept meanwhile. */

export const ACCESS_PAGES = [
  { path: "/", label: "Home" },
  { path: "/guides", label: "Guides" },
  { path: "/pricing", label: "Pricing & plans" },
  { path: "/templates", label: "Templates" },
  { path: "/create/music", label: "Beat Reel" },
  { path: "/create/talking", label: "Talking Reel" },
  { path: "/create/clips", label: "Clips from a Video" },
  { path: "/create/photo", label: "Photo Reel" },
  { path: "/create/copy", label: "Match a Reel's Style" },
  { path: "/editor", label: "Reel editor" },
] as const;

/** open to everyone, whatever the administrator chose */
export const ALWAYS_OPEN = ["/about", "/terms", "/privacy", "/refunds", "/delete-account", "/contact"];

export type Access = { open: string[]; google: boolean };
export const DEFAULT_ACCESS: Access = { open: ACCESS_PAGES.map((p) => p.path), google: true };

/** Open before signing in: an always-open page, or a page the administrator opened (a page's sub-pages with it). */
export function isOpen(pathname: string, a: Access = DEFAULT_ACCESS): boolean {
  if (ALWAYS_OPEN.includes(pathname)) return true;
  return a.open.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

/** The address to return to after signing in: a page of this site only. */
export const safeNext = (next: unknown) => (typeof next === "string" && /^\/(?![/\\])/.test(next) && next.length <= 600 ? next : "/");
