import { getCategories } from "../../categories/server/get-categories";
import { getProducts } from "../../products/server/get-products";
import { OfferForm } from "./components/offer-form";
import { getOffer } from "./server/get-offer";

export default async function OfferPage({
  params,
}: {
  params: { storeId: string; offerId: string };
}) {
  const offer =
    params.offerId === "new" ? null : await getOffer(params.offerId);

  const products = await getProducts(params.storeId);
  const categories = await getCategories(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OfferForm
          initialData={offer}
          products={products}
          categories={categories}
        />
      </div>
    </div>
  );
}
