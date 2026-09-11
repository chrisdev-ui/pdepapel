import { notFound } from "next/navigation";

import { OfferForm } from "./components/offer-form";
import { getOffer } from "./server/get-offer";
import { getOfferPickerData } from "./server/get-offer-picker";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function OfferPage({
  params,
}: {
  params: { storeId: string; offerId: string };
}) {
  const isNew = NEW_SEGMENTS.has(params.offerId);
  const [offer, picker] = await Promise.all([
    isNew ? Promise.resolve(null) : getOffer(params.offerId, params.storeId),
    getOfferPickerData(params.storeId),
  ]);
  if (!isNew && !offer) notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <OfferForm initialData={offer} picker={picker} />
      </div>
    </div>
  );
}
