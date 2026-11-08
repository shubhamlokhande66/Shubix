import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/atoms/Button";
import { Card } from "@/components/atoms/Card";
import { RichText } from "@/components/molecules/RichText";
import { GUIDES, guide } from "@/lib/guides";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = guide((await params).slug);
  return g ? { title: g.title, description: g.description, openGraph: { type: "article", title: g.title, description: g.description } } : {};
}

/** One guide, written on the server; the other guides follow it. */
export default async function GuidePage({ params }: Props) {
  const g = guide((await params).slug);
  if (!g) notFound();
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-4">
      <header className="flex flex-col gap-2">
        <Link href="/guides" className="w-fit text-[11px] font-extrabold uppercase tracking-[.2em] text-accent hover:underline">Shubix · Guides</Link>
        <h1 className="m-0 font-[family-name:var(--font-display)] text-[clamp(26px,5vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em]">{g.title}</h1>
        <p className="m-0 leading-relaxed text-muted">{g.description} · {g.minutes} min read</p>
      </header>
      <div className="flex flex-col gap-4 text-[15px]"><RichText text={g.body} /></div>
      <Card className="flex flex-col gap-3 p-5">
        <b className="text-[15px]">Try it with your own clips</b>
        <p className="m-0 text-[14px] leading-relaxed text-muted">Add a song you have the right to use and a few clips: Shubix cuts them on the beat, and you can change every shot.</p>
        <LinkButton href="/create/music" className="w-fit">Make a Beat Reel</LinkButton>
      </Card>
      <nav aria-label="More guides" className="flex flex-col gap-2">
        <b className="text-[15px]">More guides</b>
        {GUIDES.filter((x) => x.slug !== g.slug).map((x) => <Link key={x.slug} href={`/guides/${x.slug}`} className="text-[14px] text-accent hover:underline">{x.title}</Link>)}
      </nav>
    </article>
  );
}
