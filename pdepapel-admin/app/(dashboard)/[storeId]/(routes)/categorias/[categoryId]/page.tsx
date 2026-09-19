import { notFound } from "next/navigation";

import { activeOrCurrentWhere } from "@/lib/attribute-archive";
import { getAttributeSiblings, getAttributeUsage } from "@/lib/attribute-usage";
import { isCategoryCoverConfigured } from "@/lib/category-covers";
import prismadb from "@/lib/prismadb";
import { CategoryForm, type CategoryFormType } from "./components/category-form";

export default async function CategoryPage({
  params,
}: {
  params: { categoryId: string; storeId: string };
}) {
  const isNew = params.categoryId === "nuevo";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nueva».
  const category = isNew
    ? null
    : await prismadb.category.findFirst({
        where: { id: params.categoryId, storeId: params.storeId },
      });
  if (!isNew && !category) notFound();

  const [types, usage, offersCount, siblings] = await Promise.all([
    prismadb.type.findMany({
      where: { storeId: params.storeId, ...activeOrCurrentWhere(category?.typeId) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, icon: true, iconSvg: true, isArchived: true },
    }),
    category
      ? getAttributeUsage(prismadb, { storeId: params.storeId, kind: "categories", id: category.id })
      : Promise.resolve({ activeProducts: 0, archivedProducts: 0, groups: 0 }),
    category ? prismadb.offerCategory.count({ where: { categoryId: category.id } }) : Promise.resolve(0),
    getAttributeSiblings(prismadb, "categories", params.storeId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <CategoryForm
        initialData={category}
        types={types satisfies CategoryFormType[]}
        usage={{ ...usage, offersCount }}
        siblings={siblings}
        coverConfigured={isCategoryCoverConfigured()}
      />
    </div>
  );
}
