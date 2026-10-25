import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { env } from "@/lib/env.mjs";

import { BrandForm } from "./components/brand-form";
import { getBrand, getBrandParentOptions } from "./server/get-brand";

export const metadata: Metadata = {
  title: "Marca | PdePapel Admin",
};

const NEW_SEGMENTS = new Set(["nueva", "nuevo"]);

export default async function BrandPage({ params }: { params: { brandId: string; storeId: string } }) {
  const isNew = NEW_SEGMENTS.has(params.brandId);
  const brand = isNew ? null : await getBrand(params.storeId, params.brandId);

  // Un id de otra tienda o inexistente no debe abrir el formulario de «nueva».
  if (!isNew && !brand) notFound();

  const parentOptions = await getBrandParentOptions(params.storeId, brand?.id ?? null, brand?.parentBrandId ?? null);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <BrandForm initialData={brand} parentOptions={parentOptions} storeUrl={env.FRONTEND_STORE_URL ?? null} />
      </div>
    </div>
  );
}
