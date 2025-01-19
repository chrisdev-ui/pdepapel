import { ReviewsClient } from "./components/client";
import { getReviews } from "./server/get-reviews";

export default async function ReviewsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const reviews = await getReviews(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ReviewsClient data={reviews} />
      </div>
    </div>
  );
}
