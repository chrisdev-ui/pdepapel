import { env } from "@/lib/env.mjs";
import { ProductForm } from "./components/product-form";
import { ProductWorkspaceAside, ProductWorkspaceHeader } from "./components/product-workspace";
import { getProduct } from "./server/get-product";

export default async function ProductPage({
  params,
}: {
  params: { productId: string; storeId: string };
}) {
  const {
    product,
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

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      {product ? (
        <ProductWorkspaceHeader product={product} storeUrl={env.FRONTEND_STORE_URL} />
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Nuevo producto</h1>
          <p className="text-sm text-muted-foreground">Sube la foto, completa nombre, precio y categoría; la lista de la derecha te dice qué falta para venderlo.</p>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
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
        />
        </div>
        <ProductWorkspaceAside product={product} storeId={params.storeId} />
      </div>
    </div>
  );
}
