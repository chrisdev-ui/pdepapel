import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { getSuggestionBrands } from "./server/get-suggestion-brands";

const SuggestionsClient = dynamic(() => import("./components/suggestions-client"), { ssr: false });

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Sugerencias de marca | PdePapel Admin",
  description: "Productos cuyo nombre dice una marca o uno de sus alias",
};

export default async function BrandSuggestionsPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: { marca?: string };
}) {
  const brands = await getSuggestionBrands(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <SuggestionsClient brands={brands} initialBrandId={searchParams.marca ?? null} />
      </div>
    </div>
  );
}
