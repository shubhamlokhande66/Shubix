import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/atoms/Card";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides to better Reels",
  description: "Practical guides to editing short vertical videos: beat-synced cuts, hooks, transitions, music rights, sizes and more.",
};

/** The guides: written on the server, so they read the same before any script runs (and for search engines). */
export default function GuidesPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-4">
      <header className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[.2em] text-accent">Shubix · Guides</span>
        <h1 className="m-0 font-[family-name:var(--font-display)] text-[clamp(28px,5vw,42px)] font-semibold leading-[1.08] tracking-[-0.03em]">Guides to better Reels</h1>
        <p className="m-0 max-w-2xl leading-relaxed text-muted">Short, practical guides from the people who build Shubix: how to plan, shoot and edit vertical videos that people watch to the end.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <Card variant="interactive" className="flex h-full flex-col gap-2 p-5">
              <h2 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">{g.title}</h2>
              <p className="m-0 text-[14px] leading-relaxed text-muted">{g.description}</p>
              <span className="mt-auto text-[12px] text-muted">{g.minutes} min read</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
