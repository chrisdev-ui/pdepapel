import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
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
  const [products, suppliers, store, categories, sizes, colors, designs] =
    await Promise.all([
      getProducts(params.storeId),
      prismadb.supplier.findMany({
        where: { storeId: params.storeId },
        orderBy: { name: "asc" },
      }),
      prismadb.store
        .findUnique({
          where: { id: params.storeId },
          select: { lowStockThreshold: true },
        })
        .catch(() => null),
      // Taxonomías para la edición en lote (antes vivían en «Gestión masiva»).
      prismadb.category.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prismadb.size.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        select: { id: true, name: true, value: true },
        orderBy: { name: "asc" },
      }),
      prismadb.color.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        select: { id: true, name: true, value: true },
        orderBy: { name: "asc" },
      }),
      prismadb.design.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <ProductClient
        data={products}
        suppliers={suppliers}
        taxonomies={{ categories, sizes, colors, designs }}
        lowStockThreshold={store?.lowStockThreshold ?? null}
      />
    </div>
  );
}
