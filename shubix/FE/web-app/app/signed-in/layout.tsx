import type { Metadata } from "next";

/** Authentication callback route; it is not a public search result. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
