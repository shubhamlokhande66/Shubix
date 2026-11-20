import type { Metadata } from "next";

/** The editor is a private app workflow, not a search landing page. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
