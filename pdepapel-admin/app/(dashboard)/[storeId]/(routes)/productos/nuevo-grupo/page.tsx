import prismadb from "@/lib/prismadb";
import { ProductGroupForm } from "../components/product-group-form";

export default async function ProductGroupPage({
  params,
}: {
  params: { storeId: string };
}) {
  const categories = await prismadb.category.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  const sizes = await prismadb.size.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  const colors = await prismadb.color.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  const designs = await prismadb.design.findMany({
    where: {
      storeId: params.storeId,
    },
  });
  const suppliers = await prismadb.supplier.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductGroupForm
          categories={categories}
          colors={colors}
          sizes={sizes}
          designs={designs}
          suppliers={suppliers}
        />
      </div>
    </div>
  );
}
