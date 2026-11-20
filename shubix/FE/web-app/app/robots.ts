import type { MetadataRoute } from "next";

/** Public marketing and help pages are crawlable. Private app screens are excluded because their client shell
 * intentionally renders a loading/sign-in state to anonymous visitors; those routes also carry noindex metadata. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/guides", "/about", "/pricing", "/terms", "/privacy", "/refunds", "/contact", "/delete-account"],
      disallow: [
        "/api/",
        "/admin",
        "/account",
        "/rewards",
        "/affiliate",
        "/create/",
        "/projects",
        "/editor",
        "/reels",
        "/library",
        "/songs",
        "/settings",
        "/voices",
        "/trends",
        "/brands",
        "/login",
        "/signed-in",
        "/verify",
        "/forgot",
        "/reset",
        "/cms",
        "/engine",
        "/templates",
      ],
    }],
    sitemap: `${process.env.PUBLIC_BASE_URL || "https://shubix.in"}/sitemap.xml`,
  };
}
