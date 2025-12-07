import dynamic from "next/dynamic";
import { getCategories } from "./server/get-categories";

const CategoryClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Categorías | PdePapel Admin",
  description: "Gestión de categorías",
};

export default async function CategoriesPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const categories = await getCategories(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CategoryClient data={categories} />
      </div>
    </div>
  );
}
