import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";

/** The public pages for search engines (the same ones robots.ts allows), the guides among them. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.PUBLIC_BASE_URL || "https://shubix.in";
  return ["", "/guides", ...GUIDES.map((g) => `/guides/${g.slug}`), "/about", "/pricing", "/terms", "/privacy", "/refunds", "/delete-account", "/contact"].map((p) => ({ url: `${base}${p}` }));
}
