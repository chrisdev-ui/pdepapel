import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { env } from "@/lib/env.mjs";

import { getBrandSuggestionOverview } from "./server/get-brand-suggestion-overview";
import { getBrands } from "./server/get-brands";

const BrandsClient = dynamic(() => import("./components/client"), { ssr: false });

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Marcas | PdePapel Admin",
  description: "Marcas de los productos: logo, página en la tienda y filtro",
};

export default async function BrandsPage({ params }: { params: { storeId: string } }) {
  const [brands, overview] = await Promise.all([
    getBrands(params.storeId),
    getBrandSuggestionOverview(params.storeId),
  ]);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <BrandsClient
          data={brands}
          unbranded={overview.unbranded}
          unbrandedMatching={overview.unbrandedMatching}
          storeUrl={env.FRONTEND_STORE_URL ?? null}
        />
      </div>
    </div>
  );
}
