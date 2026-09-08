import prismadb from "@/lib/prismadb";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getProducts } from "./server/get-products";

const ProductClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;
export const maxDuration = 60;

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
  const [products, suppliers] = await Promise.all([
    getProducts(params.storeId),
    prismadb.supplier.findMany({
      where: { storeId: params.storeId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <ProductClient data={products} suppliers={suppliers} />
    </div>
  );
}
