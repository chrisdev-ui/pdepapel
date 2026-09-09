"use client";

import { Star } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { ReviewItem } from "@/components/reviews/review-item";
import { Button } from "@/components/ui/button";
import { getAverageRating } from "@/lib/product-card";
import { cn } from "@/lib/utils";
import { Review } from "@/types";

const ReviewForm = dynamic(() => import("@/components/reviews/review-form").then((module) => module.ReviewForm), {
  ssr: false,
  loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" aria-hidden="true" />,
});

interface ReviewsProps {
  productId: string;
  reviews: Review[];
}

const PAGE_SIZE = 4;
const STEPS = [5, 4, 3, 2, 1];

export const REVIEWS_SECTION_ID = "resenas";

/**
 * Reseñas de la ficha: resumen con distribución, lista (renderizada en el
 * servidor para que Google la lea) y formulario solo con sesión.
 */
export function Reviews({ productId, reviews = [] }: ReviewsProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const summary = getAverageRating(reviews);
  const sorted = [...reviews].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const recommended = reviews.length ? Math.round((reviews.filter((review) => review.rating >= 4).length / reviews.length) * 100) : 0;

  return (
    <section id={REVIEWS_SECTION_ID} aria-labelledby="resenas-titulo" className="scroll-mt-40 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12">
      <div className="flex flex-col gap-4">
        <h2 id="resenas-titulo" className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
          Reseñas
        </h2>
        {summary ? (
          <>
            <div className="flex items-center gap-4">
              <span className="font-quicksand text-5xl font-bold leading-none text-blue-yankees">
                {summary.average.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <div className="flex flex-col gap-1">
                <span role="img" aria-label={`Calificación promedio ${summary.average} de 5`} className="inline-flex gap-0.5">
                  {STEPS.map((step) => (
                    <Star key={step} aria-hidden="true" className={cn("h-[18px] w-[18px]", 6 - step <= Math.round(summary.average) ? "fill-yellow-star text-yellow-star" : "text-gray-300")} />
                  ))}
                </span>
                <span className="font-sans text-sm text-gray-500">
                  {summary.count} {summary.count === 1 ? "reseña" : "reseñas"} · {recommended} % la recomienda
                </span>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5" aria-label="Distribución de calificaciones">
              {STEPS.map((step) => {
                const count = reviews.filter((review) => review.rating === step).length;
                const percent = Math.round((count / reviews.length) * 100);
                return (
                  <li key={step} className="flex items-center gap-2 font-sans text-xs text-gray-500">
                    <span className="w-3 text-right">{step}</span>
                    <Star aria-hidden="true" className="h-3 w-3 fill-yellow-star text-yellow-star" />
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full bg-yellow-star" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="w-6">{count}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="font-sans text-sm text-gray-600">Todavía no hay reseñas. Sé la primera en contar qué te pareció.</p>
        )}
        <ReviewForm productId={productId} reviews={reviews} />
      </div>
      <div className="mt-8 flex flex-col gap-3 lg:mt-0">
        {sorted.length > 0 && (
          <p className="font-sans text-sm font-semibold text-blue-yankees">
            Mostrando {Math.min(visible, sorted.length)} de {sorted.length}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {sorted.slice(0, visible).map((review) => (
            <li key={review.id}>
              <ReviewItem review={review} />
            </li>
          ))}
        </ul>
        {sorted.length > visible && (
          <Button variant="outline" onClick={() => setVisible((current) => current + PAGE_SIZE)} className="self-center rounded-full border-2 border-blue-yankees font-sans font-semibold text-blue-yankees">
            Ver más reseñas
          </Button>
        )}
      </div>
    </section>
  );
}
