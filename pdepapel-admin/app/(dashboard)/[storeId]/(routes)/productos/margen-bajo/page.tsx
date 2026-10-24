import type { Metadata } from "next";

import { getActiveOffers } from "@/lib/discount-engine";
import { loadLowMargin, parseLowMarginQuery } from "@/lib/low-margin-list";
import type { ActiveOffer } from "@/lib/offer-pricing";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

import { LowMarginView } from "./components/low-margin-view";

export const revalidate = 0;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Margen bajo | PdePapel Admin",
  description: "Productos bajo el costo o bajo el margen mínimo de la tienda",
};

export default async function LowMarginPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Muestra costos y márgenes: solo la dueña.
  await requireStoreOwner(params.storeId);
  const offers = (await getActiveOffers(params.storeId)) as unknown as ActiveOffer[];
  const data = await loadLowMargin(prismadb, params.storeId, parseLowMarginQuery(searchParams), offers);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <LowMarginView storeId={params.storeId} data={data} />
      </div>
    </div>
  );
}
