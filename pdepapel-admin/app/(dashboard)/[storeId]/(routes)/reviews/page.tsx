import type { Metadata } from "next";
import { ReviewsClient } from "./components/client";
import { getReviews } from "./server/get-reviews";

export const metadata: Metadata = {
  title: "Reseñas | PdePapel Admin",
  description: "Gestión de reseñas de clientes",
};
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
