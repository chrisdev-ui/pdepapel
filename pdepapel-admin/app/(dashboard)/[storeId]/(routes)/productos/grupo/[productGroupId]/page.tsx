import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { ProductGroupForm } from "../../components/product-group-form";

const ProductGroupPage = async ({
  params,
}: {
  params: { storeId: string; productGroupId: string };
}) => {
  const productGroup = await prismadb.productGroup.findUnique({
    where: {
      id: params.productGroupId,
    },
    include: {
      images: true,
      products: {
        include: {
          images: true,
          color: true,
          size: true,
          design: true,
        },
      },
    },
  });

  // Atributos activos más los que ya usan las variantes del grupo.
  const usedIds = (field: "categoryId" | "sizeId" | "colorId" | "designId") =>
    Array.from(new Set((productGroup?.products ?? []).map((product) => product[field]).filter((id): id is string => Boolean(id))));

  const categories = await prismadb.category.findMany({
    where: {
      storeId: params.storeId,
      OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("categoryId") } }],
    },
  });

  const sizes = await prismadb.size.findMany({
    where: {
      storeId: params.storeId,
      OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("sizeId") } }],
    },
  });

  const colors = await prismadb.color.findMany({
    where: {
      storeId: params.storeId,
      OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("colorId") } }],
    },
  });

  const designs = await prismadb.design.findMany({
    where: {
      storeId: params.storeId,
      OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("designId") } }],
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
          initialData={productGroup}
        />
      </div>
    </div>
  );
};

export default ProductGroupPage;
