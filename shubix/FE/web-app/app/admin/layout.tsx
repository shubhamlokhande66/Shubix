import type { Metadata } from "next";

/** Admin is a private, authenticated application screen and must never appear in search results. */
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
