import type { Metadata } from "next";

/** Templates are an authenticated, data-driven app screen rather than a public landing page. */
export const metadata: Metadata = {
  title: "Templates",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
