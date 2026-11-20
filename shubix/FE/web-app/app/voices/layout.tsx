import type { Metadata } from "next";

/** the browser tab / installed app title of this part of the app ("Voices · Shubix") */
export const metadata: Metadata = { title: "Voices", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
