import { notFound } from "next/navigation";

import { parsePreselectedProductIds } from "@/lib/offer-preselection";

import { OfferForm, type OfferSeed } from "./components/offer-form";
import { getOffer } from "./server/get-offer";
import { getOfferPickerData } from "./server/get-offer-picker";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: { storeId: string; offerId: string };
  searchParams: { desde?: string; productos?: string | string[] };
}) {
  const isNew = NEW_SEGMENTS.has(params.offerId);
  const offer = isNew ? null : await getOffer(params.offerId, params.storeId);
  if (!isNew && !offer) notFound();
  // «Duplicar»: una oferta nueva que arranca con los datos y el alcance de otra.
  const source = isNew && searchParams.desde ? await getOffer(searchParams.desde, params.storeId) : null;
  /**
   * «Crear una oferta» desde Rendimiento y «Poner en oferta» desde Inventario:
   * una oferta nueva y vacía, pero con los productos que la pantalla anterior
   * señalaba ya elegidos. Solo cuando no hay `desde`, que trae su propio
   * alcance completo y manda.
   */
  const preselectedProductIds =
    isNew && !source ? parsePreselectedProductIds(searchParams.productos) : [];
  const base = offer ?? source;
  const scopeProductIds =
    base?.products.map((row) => row.productId) ?? preselectedProductIds;
  /*
    La pertenencia a la tienda no se comprueba aquí: `loadScopeProducts`
    consulta `where: { storeId, id: { in: ids } }`, así que un id de otra
    tienda no vuelve y nunca llega al formulario. Es la misma garantía que ya
    tenía `?desde=`.
  */
  const picker = await getOfferPickerData(params.storeId, scopeProductIds, offer?.id ?? null);
  const seed: OfferSeed | null = source
    ? {
        origin: "duplicate",
        name: `${source.name} (copia)`,
        label: source.label,
        type: source.type,
        amount: source.amount,
        productIds: source.products.map((row) => row.productId),
        categoryIds: source.categories.map((row) => row.categoryId),
        productGroupIds: source.productGroups.map((row) => row.productGroupId),
      }
    : preselectedProductIds.length > 0
      ? {
          origin: "preselection",
          name: "",
          label: null,
          // Los que sí existen en esta tienda; los demás se cayeron en la consulta.
          productIds: picker.selectedProducts.map((product) => product.id),
          categoryIds: [],
          productGroupIds: [],
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
