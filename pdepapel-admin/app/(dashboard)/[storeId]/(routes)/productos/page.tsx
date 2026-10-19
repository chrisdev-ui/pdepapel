import { loadBrandOptions } from "@/lib/brand-options";
import { parseProductListQuery, type ProductListQuery } from "@/lib/product-list-query";
import { SUPPLIER_PICKER_SELECT } from "@/lib/public-catalog";
import { requireStoreRead } from "@/lib/store-access";
import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import { env } from "@/lib/env.mjs";
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
  searchParams,
}: {
  params: {
    storeId: string;
  };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireStoreRead(params.storeId);
  const query = parseProductListQuery(searchParams);
  const [result, suppliers, attributeName, categories, sizes, colors, designs, brands] =
    await Promise.all([
      getProducts(params.storeId, query),
      prismadb.supplier.findMany({
        where: { storeId: params.storeId },
        orderBy: { name: "asc" },
        select: SUPPLIER_PICKER_SELECT,
      }),
      loadAttributeName(params.storeId, query.attribute),
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
      loadBrandOptions(params.storeId),
    ]);

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <ProductClient
        data={result.products}
        list={{
          counts: result.counts,
          summary: result.summary,
          total: result.total,
          page: result.page,
          pageCount: result.pageCount,
          pageSize: result.pageSize,
          facets: result.facets,
          query,
          attributeName,
        }}
        suppliers={suppliers}
        taxonomies={{ categories, sizes, colors, designs }}
        brands={brands}
        lowStockThreshold={result.lowStockThreshold}
        storeUrl={env.FRONTEND_STORE_URL}
      />
    </div>
  );
}

/** El nombre del color, tamaño, diseño o subcategoría que llega desde Atributos. */
async function loadAttributeName(storeId: string, attribute: ProductListQuery["attribute"]): Promise<string | null> {
  if (!attribute) return null;
  const where = { id: attribute.id, storeId };
  const select = { name: true } as const;
  const row =
    attribute.field === "colorId"
      ? await prismadb.color.findFirst({ where, select })
      : attribute.field === "sizeId"
        ? await prismadb.size.findFirst({ where, select })
        : attribute.field === "designId"
          ? await prismadb.design.findFirst({ where, select })
          : await prismadb.category.findFirst({ where, select });
  return row?.name ?? null;
}
