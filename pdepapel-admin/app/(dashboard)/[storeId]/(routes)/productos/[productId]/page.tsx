import { env } from "@/lib/env.mjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "./components/product-form";
import {
  ProductWorkspaceAside,
  ProductWorkspaceHeader,
} from "./components/product-workspace";
import { NEW_PRODUCT_SEGMENT } from "@/lib/product-routes";
import { getProduct, getProductSeed } from "./server/get-product";

export const metadata: Metadata = {
  title: "Producto | PdePapel Admin",
};

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: { productId: string; storeId: string };
  searchParams?: { desde?: string };
}) {
  const {
    product,
    activePresale,
    categories,
    types,
    sizes,
    colors,
    designs,
    suppliers,
    catalogOptions,
    reviews,
    productGroup,
    productGroups,
  } = await getProduct(params.productId, params.storeId);

  if (!product && params.productId !== NEW_PRODUCT_SEGMENT) notFound();

  // «Duplicar» desde la lista o la ficha: siembra el formulario de creación.
  const seed =
    !product && searchParams?.desde
      ? await getProductSeed(params.storeId, searchParams.desde)
      : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      {product ? (
        <ProductWorkspaceHeader
          product={product}
          storeUrl={env.FRONTEND_STORE_URL}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {seed ? `Copia de «${seed.sourceName}»` : "Nuevo producto"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {seed
              ? "Se copiaron nombre, precio, costo, clasificación y descripción. Sube fotos nuevas y revisa el stock inicial; el SKU y la URL se generan al guardar."
              : "Sube la foto, completa nombre, precio y categoría; la lista de la derecha te dice qué falta para venderlo."}
          </p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <ProductForm
            categories={categories}
            types={types}
            sizes={sizes}
            colors={colors}
            designs={designs}
            initialData={product}
            reviews={reviews}
            suppliers={suppliers}
            catalogOptions={catalogOptions}
            productGroup={productGroup}
            productGroups={productGroups}
            activePresale={activePresale}
            seed={seed}
          />
        </div>
        <ProductWorkspaceAside product={product} storeId={params.storeId} />
      </div>
    </div>
  );
}
