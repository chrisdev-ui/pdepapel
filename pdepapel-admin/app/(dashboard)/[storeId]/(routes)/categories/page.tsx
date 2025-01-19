import { CategoryClient } from "./components/client";
import { getCategories } from "./server/get-categories";

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
