import type { Metadata } from "next";
import Link from "next/link";

/** the browser tab / installed app title of this part of the app ("Pricing & plans · Shubix") */
export const metadata: Metadata = {
  title: "Pricing & plans",
  description: "Shubix plans and credits: make Reels free on your phone, or let Shubix AI edit them on a paid plan. No card for Free, nothing renews by itself, prices include GST.",
};

/** How plans and credits work, written on the server under the live plans (the page itself is drawn in the browser, from
 * the plans the administrator sets): search engines and people without scripts read it too. No prices here: they are the
 * administrator's (Admin → Plans & pricing) and shown above. */
function HowPlansWork() {
  return (
    <section aria-labelledby="plans-how" className="mx-auto mt-10 flex w-full max-w-3xl flex-col gap-4 pb-6 text-[15px]">
      <h2 id="plans-how" className="m-0 font-[family-name:var(--font-display)] text-[22px] font-semibold">How Shubix plans and credits work</h2>
      <p className="m-0 leading-relaxed text-muted">
        Shubix turns your clips, photos and a song into a vertical video cut on the beat, ready for Instagram Reels, YouTube Shorts and WhatsApp Status. Most of the editing happens on your own phone or computer, which is why the Free plan can stay free.
      </p>
      <h3 className="m-0 text-[16px] font-semibold">The Free plan</h3>
      <p className="m-0 leading-relaxed text-muted">
        Make and edit Reels without paying and without adding a card. Beat-synced cutting, the timeline editor, text, stickers, filters and export are included. Some tools, effects and fonts are marked with a crown: everyone can try them, and exporting with them needs the plan they belong to.
      </p>
      <h3 className="m-0 text-[16px] font-semibold">Paid plans and Shubix AI</h3>
      <p className="m-0 leading-relaxed text-muted">
        Paid plans add Shubix AI, which looks at your clips and your song to choose the moments, transitions and effects for you. They also unlock the crowned tools and, depending on the plan, the best export quality, 60 fps and Reels without a watermark. Each plan comes with credits; the table above shows what every plan includes.
      </p>
      <h3 className="m-0 text-[16px] font-semibold">What credits are for</h3>
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-muted">
        <li className="list-disc leading-relaxed">A Reel edited by Shubix AI uses a few credits; the number is shown before you start.</li>
        <li className="list-disc leading-relaxed">Previews and every edit you make on your phone are free.</li>
        <li className="list-disc leading-relaxed">If a Reel fails, its credits are given back.</li>
        <li className="list-disc leading-relaxed">Top-up credits can be bought any time and never expire.</li>
      </ul>
      <h3 className="m-0 text-[16px] font-semibold">Payments</h3>
      <p className="m-0 leading-relaxed text-muted">
        Payments are handled by Cashfree, with UPI, cards, net banking and wallets. Shubix never sees your card or UPI details. Every price includes GST, and nothing renews by itself: when a plan ends, you choose whether to continue.
      </p>
      <p className="m-0 leading-relaxed text-muted">
        Questions about a payment? Read the <Link href="/refunds" className="text-accent hover:underline">refund policy</Link> and the <Link href="/terms" className="text-accent hover:underline">terms</Link>, or <Link href="/contact" className="text-accent hover:underline">contact us</Link>. New to Reels? Start with our <Link href="/guides" className="text-accent hover:underline">guides</Link>.
      </p>
    </section>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <HowPlansWork />
    </>
  );
}
