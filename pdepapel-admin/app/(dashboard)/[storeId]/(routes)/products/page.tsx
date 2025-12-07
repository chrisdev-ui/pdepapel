import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getProducts } from "./server/get-products";

const ProductClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Productos | PdePapel Admin",
  description: "Gestión de inventario y productos",
};

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
