import type { Metadata } from "next";

/** Email verification is an account workflow, not a public search page. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
