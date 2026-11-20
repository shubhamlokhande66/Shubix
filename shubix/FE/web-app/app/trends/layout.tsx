import type { Metadata } from "next";

/** the browser tab / installed app title of this part of the app ("Trends · Shubix") */
export const metadata: Metadata = { title: "Trends", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
