import prismadb from "@/lib/prismadb";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCategories } from "../categorias/server/get-categories";
import { getColors } from "../colores/server/get-colors";
import { getDesigns } from "../disenos/server/get-designs";
import { getSizes } from "../tamanos/server/get-sizes";
import { getTypes } from "../tipos/server/get-types";

const AttributesClient = dynamic(() => import("./components/client"), { ssr: false });

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Atributos | PdePapel Admin",
  description: "Categorías, subcategorías, tamaños, colores, diseños y opciones para clientes",
};

export default async function AttributesPage({ params }: { params: { storeId: string } }) {
  const [types, categories, sizes, colors, designs, options] = await Promise.all([
    getTypes(params.storeId),
    getCategories(params.storeId),
    getSizes(params.storeId),
    getColors(params.storeId),
    getDesigns(params.storeId),
    prismadb.catalogOption
      .findMany({
        where: { storeId: params.storeId },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          key: true,
          name: true,
          isActive: true,
          values: { select: { id: true, name: true, value: true }, orderBy: { displayOrder: "asc" } },
          _count: { select: { productValues: true, categories: true } },
        },
      })
      .catch(() => []),
  ]);

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <AttributesClient types={types} categories={categories} sizes={sizes} colors={colors} designs={designs} options={options} />
    </div>
  );
}
