import type { Metadata } from "next";

/** About Shubix: its own title and address (it had the site's title, like the home page) */
export const metadata: Metadata = {
  title: "About Shubix",
  description: "Shubix is a Reels video studio from Pune: add your song and clips, and Shubix cuts them on the beat, on your phone or in the browser.",
  alternates: { canonical: "/about" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
