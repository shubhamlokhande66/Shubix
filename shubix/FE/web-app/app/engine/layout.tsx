import type { Metadata } from "next";

/** The internal rendering engine is not a public page and must never appear in search results. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
