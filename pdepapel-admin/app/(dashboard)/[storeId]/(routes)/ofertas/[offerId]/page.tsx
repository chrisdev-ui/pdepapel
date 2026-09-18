import { notFound } from "next/navigation";

import { OfferForm, type OfferSeed } from "./components/offer-form";
import { getOffer } from "./server/get-offer";
import { getOfferPickerData } from "./server/get-offer-picker";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: { storeId: string; offerId: string };
  searchParams: { desde?: string };
}) {
  const isNew = NEW_SEGMENTS.has(params.offerId);
  const offer = isNew ? null : await getOffer(params.offerId, params.storeId);
  if (!isNew && !offer) notFound();
  // «Duplicar»: una oferta nueva que arranca con los datos y el alcance de otra.
  const source = isNew && searchParams.desde ? await getOffer(searchParams.desde, params.storeId) : null;
  const base = offer ?? source;
  const picker = await getOfferPickerData(params.storeId, base?.products.map((row) => row.productId) ?? [], offer?.id ?? null);
  const seed: OfferSeed | null = source
    ? {
        name: `${source.name} (copia)`,
        label: source.label,
        type: source.type,
        amount: source.amount,
        productIds: source.products.map((row) => row.productId),
        categoryIds: source.categories.map((row) => row.categoryId),
        productGroupIds: source.productGroups.map((row) => row.productGroupId),
      }
    : null;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <OfferForm initialData={offer} seed={seed} picker={picker} />
      </div>
    </div>
  );
}
