import type { Metadata } from "next";

/** the browser tab / installed app title of this part of the app ("AI settings · Shubix") */
export const metadata: Metadata = { title: "AI settings", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
