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
    </div>
  );
};
