import { Star } from "lucide-react";
import Link from "next/link";

import { getReviews } from "@/actions/get-reviews";
import { ScrollRail } from "@/components/home/scroll-rail";
import { productPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { HomeReview } from "@/types";

const MIN_REVIEWS = 3;

function Stars({ rating, className }: { rating: number; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span role="img" className={cn("inline-flex items-center", className)} aria-label={`${rating} de 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} aria-hidden="true" className={cn("h-4 w-4", index < rounded ? "fill-yellow-star text-yellow-star" : "text-gray-300")} />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: HomeReview }) {
  return (
    <article className="flex w-[18.75rem] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:w-[22rem] sm:p-5">
      <Stars rating={review.rating} />
      {review.comment && <p className="line-clamp-4 font-sans text-sm leading-relaxed text-blue-yankees sm:text-[15px]">{review.comment}</p>}
      <div className="flex items-center justify-between gap-2 font-sans text-[13px]">
        <span className="truncate font-semibold text-gray-500">
          {review.name} · {review.product.name}
        </span>
        {!review.product.isArchived && (
          <Link href={productPath(review.product.slug || review.product.id)} className="shrink-0 font-semibold text-blue-yankees underline underline-offset-4">
            Ver producto
          </Link>
        )}
      </div>
      {review.reply && (
        <div className="rounded-r-xl border-l-[3px] border-pink-shell bg-kawaii-pink-light/30 px-3 py-2 font-sans text-[13px] leading-relaxed text-blue-yankees">
          <strong>Respuesta de P de Papel</strong>
          <br />
          {review.reply}
        </div>
      )}
    </article>
  );
}

export async function ReviewsCarousel() {
  const { reviews, summary } = await getReviews(9);
  if (reviews.length < MIN_REVIEWS) return null;

  return (
    <section aria-labelledby="reviews-title" className="bg-kawaii-lavender-light/25 py-8 lg:py-10">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 sm:px-6 lg:px-8">
        <ScrollRail
          ariaLabel="Reseñas de clientas"
          heading={{
            id: "reviews-title",
            title: "Lo que dicen quienes ya compraron",
            eyebrow:
              summary.average !== null ? (
                <span className="inline-flex items-center gap-2 font-sans text-sm font-bold text-blue-yankees">
                  <Stars rating={summary.average} />
                  {summary.average.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  <span className="font-medium text-gray-500">· {summary.count} reseñas publicadas</span>
                </span>
              ) : null,
          }}
        >
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ScrollRail>
      </div>
    </section>
  );
}
