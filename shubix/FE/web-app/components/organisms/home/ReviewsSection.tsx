"use client";

import { SectionHeader } from "@/components/molecules";
import { Stars } from "@/components/organisms/ReviewPrompt";
import { api } from "@/lib/api";
import { useSafeQuery as useQuery } from "@/lib/useSafeQuery";

/** Home: what creators say, the reviews an admin approved (Admin → Reviews). Nothing until there is one. */
export function ReviewsSection() {
  const q = useQuery({ queryKey: ["public-reviews"], queryFn: api.publicReviews, staleTime: 5 * 60_000, retry: false });
  const reviews = q.data?.reviews ?? [];
  if (!reviews.length) return null;
  return (
    <section aria-labelledby="reviews-h" className="flex flex-col gap-3">
      <SectionHeader id="reviews-h" title="What creators say" />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {reviews.map((r) => (
          <figure key={r.id} className="m-0 flex w-[78vw] max-w-[320px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border bg-surface p-4 md:w-auto md:max-w-none">
            <Stars value={r.rating} size={16} />
            <blockquote className="m-0 text-[14px] leading-relaxed">&ldquo;{r.comment}&rdquo;</blockquote>
            <figcaption className="mt-auto text-[12.5px] font-bold text-muted">{r.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
