import { CategoryForm } from "./components/category-form";
import { getCategoryTypes } from "./server/get-category-types";

export default async function CategoryPage({
  params,
}: {
  params: { categoryId: string; storeId: string };
}) {
  const { category, types } = await getCategoryTypes(
    params.storeId,
    params.categoryId,
  );

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CategoryForm types={types} initialData={category} />
      </div>
    </div>
  );
}
