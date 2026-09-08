import { StarRating } from "@/components/ui/star-rating";
import { Review } from "@/types";

interface ReviewItemProps {
  review: Review;
}

export const ReviewItem: React.FC<ReviewItemProps> = ({ review }) => {
  const reviewStatus: Record<number, string> = {
    0: "Muy malo",
    1: "Malo",
    2: "Regular",
    3: "Bueno",
    4: "Muy bueno",
    5: "Excelente",
  };
  return (
    <div className="mb-5 flex w-full flex-col gap-2 rounded-md bg-pink-shell/20 p-5">
      <h3 className="font-serif font-semibold">{review.name}</h3>
      <div className="flex items-center space-x-1">
        <StarRating currentRating={review.rating} isDisabled />
        <span className="font-serif text-sm font-medium">
          {reviewStatus[review.rating]}
        </span>
      </div>
      <p className="text-sm">{review.comment}</p>
      {review.reply && (
        <div
          className="mt-1 rounded-md border-l-4 border-blue-yankees/40 bg-white/70 p-3"
          data-testid="review-reply"
        >
          <p className="font-serif text-sm font-semibold">
            Respuesta de P de Papel
          </p>
          <p className="text-sm">{review.reply}</p>
        </div>
      )}
    </div>
  );
};
