import type { MetadataRoute } from "next";

/** Search engines: the public pages (home, guides, pricing, the legal pages) may be listed; the app itself (its screens
 * need signing in and show nothing to a crawler but the sign-in page), the admin and the API are not for them. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/guides", "/about", "/pricing", "/terms", "/privacy", "/refunds", "/contact"], disallow: ["/api/", "/admin", "/account", "/rewards", "/affiliate", "/create/", "/projects", "/editor", "/reels", "/library", "/songs", "/settings", "/voices", "/trends", "/brands", "/login", "/signed-in", "/verify", "/forgot", "/reset", "/cms", "/engine"] }],
    sitemap: `${process.env.PUBLIC_BASE_URL || "https://shubix.in"}/sitemap.xml`,
  };
}
