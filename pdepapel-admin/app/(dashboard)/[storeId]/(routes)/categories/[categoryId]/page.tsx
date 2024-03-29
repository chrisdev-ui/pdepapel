import prismadb from "@/lib/prismadb";
import { CategoryForm } from "./components/category-form";

export default async function CategoryPage({
  params,
}: {
  params: { categoryId: string; storeId: string };
}) {
  const category = await prismadb.category.findUnique({
    where: {
      id: params.categoryId,
    },
  });

  const types = await prismadb.type.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CategoryForm types={types} initialData={category} />
      </div>
    </div>
  );
}
