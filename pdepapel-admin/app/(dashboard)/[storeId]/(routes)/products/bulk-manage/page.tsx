import prismadb from "@/lib/prismadb";
import { getProducts } from "../server/get-products";
import { BulkProductClient } from "./components/client";

export default async function BulkProductsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const products = await getProducts(params.storeId);
  const categories = await prismadb.category.findMany({
    where: { storeId: params.storeId },
  });
  const sizes = await prismadb.size.findMany({
    where: { storeId: params.storeId },
  });
  const colors = await prismadb.color.findMany({
    where: { storeId: params.storeId },
  });
  const designs = await prismadb.design.findMany({
    where: { storeId: params.storeId },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BulkProductClient
          data={products}
          categories={categories}
          sizes={sizes}
          colors={colors}
          designs={designs}
        />
      </div>
    </div>
  );
}
