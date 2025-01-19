import { ProductClient } from "./components/client";
import { getProducts } from "./server/get-products";

export default async function ProductsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const products = await getProducts(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductClient data={products} />
      </div>
    </div>
  );
}
