import { ProductForm } from "./components/product-form";
import { getProduct } from "./server/get-product";

export default async function ProductPage({
  params,
}: {
  params: { productId: string; storeId: string };
}) {
  const {
    product,
    categories,
    sizes,
    colors,
    designs,
    suppliers,
    reviews,
    productGroup,
    productGroups,
  } = await getProduct(params.productId, params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductForm
          categories={categories}
          sizes={sizes}
          colors={colors}
          designs={designs}
          initialData={product}
          reviews={reviews}
          suppliers={suppliers}
          productGroup={productGroup}
          productGroups={productGroups}
        />
      </div>
    </div>
  );
}
