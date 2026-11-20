import { permanentRedirect } from "next/navigation";

/** Shubix's articles are the Guides (/guides): people who look for "the blog" are taken there. */
export default function BlogPage(): never {
  permanentRedirect("/guides");
}
