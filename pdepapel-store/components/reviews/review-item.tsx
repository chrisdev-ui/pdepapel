import { format } from "date-fns";
import { es } from "date-fns/locale";

import { StarRating } from "@/components/ui/star-rating";
import { Review } from "@/types";

interface ReviewItemProps {
  review: Review;
}

const RATING_LABEL: Record<number, string> = {
  0: "Muy malo",
  1: "Malo",
  2: "Regular",
  3: "Bueno",
  4: "Muy bueno",
  5: "Excelente",
};

export function formatReviewDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export const ReviewItem: React.FC<ReviewItemProps> = ({ review }) => {
  const date = formatReviewDate(review.createdAt);

  return (
    <article className="flex w-full flex-col gap-2 rounded-xl bg-pink-shell/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-purple font-sans text-sm font-bold text-blue-yankees">
            {review.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="flex flex-col">
            <h3 className="font-sans text-sm font-semibold text-blue-yankees">{review.name}</h3>
            {date && <p className="font-sans text-xs text-gray-500">{date}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StarRating currentRating={review.rating} isDisabled className="h-4 w-4" />
          <span className="font-sans text-xs font-medium text-gray-600">{RATING_LABEL[review.rating]}</span>
        </div>
      </div>
      <p className="font-sans text-sm leading-relaxed text-blue-yankees">{review.comment}</p>
      {review.reply && (
        <div className="mt-1 rounded-lg border-l-4 border-blue-yankees/40 bg-white/70 p-3" data-testid="review-reply">
          <p className="font-sans text-sm font-semibold text-blue-yankees">Respuesta de P de Papel</p>
          <p className="font-sans text-sm text-blue-yankees">{review.reply}</p>
        </div>
      )}
    </article>
  );
};
