import { NamingReviewClient } from "./components/naming-review-client";
import { getProductNamingCandidates } from "./server/get-product-naming-candidates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ProductNamingPage({
  params,
}: {
  params: { storeId: string };
}) {
  const data = await getProductNamingCandidates(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <NamingReviewClient {...data} />
      </div>
    </div>
  );
}
