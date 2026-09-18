import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import { notFound } from "next/navigation";
import { ProductGroupForm } from "../../components/product-group-form";
import {
  GroupWorkspaceAside,
  GroupWorkspaceHeader,
} from "./components/group-workspace";

const ProductGroupPage = async ({
  params,
}: {
  params: { storeId: string; productGroupId: string };
}) => {
  // Acotado a la tienda: un id ajeno o inexistente responde 404 en vez de
  // pintar el formulario de creación bajo una URL de edición.
  const productGroup = await prismadb.productGroup.findFirst({
    where: {
      id: params.productGroupId,
      storeId: params.storeId,
    },
    include: {
      images: true,
      products: {
        include: {
          images: true,
          color: true,
          size: true,
          design: true,
          // Necesario para decir, antes de guardar, si una variante que se
          // quita se archiva (tiene pedidos) o se elimina.
          orderItems: { select: { id: true } },
        },
      },
    },
  });

  // Atributos activos más los que ya usan las variantes del grupo.
  const usedIds = (field: "categoryId" | "sizeId" | "colorId" | "designId") =>
    Array.from(
      new Set(
        (productGroup?.products ?? [])
          .map((product) => product[field])
          .filter((id): id is string => Boolean(id)),
      ),
    );

  const [categories, sizes, colors, designs, suppliers, store] =
    await Promise.all([
      prismadb.category.findMany({
        where: {
          storeId: params.storeId,
          OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("categoryId") } }],
        },
      }),
      prismadb.size.findMany({
        where: {
          storeId: params.storeId,
          OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("sizeId") } }],
        },
      }),
      prismadb.color.findMany({
        where: {
          storeId: params.storeId,
          OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("colorId") } }],
        },
      }),
      prismadb.design.findMany({
        where: {
          storeId: params.storeId,
          OR: [ACTIVE_ATTRIBUTE_WHERE, { id: { in: usedIds("designId") } }],
        },
      }),
      prismadb.supplier.findMany({ where: { storeId: params.storeId } }),
      prismadb.store
        .findUnique({
          where: { id: params.storeId },
          select: { lowStockThreshold: true },
        })
        .catch(() => null),
    ]);

  if (!productGroup) notFound();

  const threshold = resolveLowStockThreshold(store?.lowStockThreshold ?? null);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      {productGroup ? (
        <GroupWorkspaceHeader
          group={productGroup}
          lowStockThreshold={threshold}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Nuevo grupo de variantes
          </h1>
          <p className="text-sm text-muted-foreground">
            Un mismo artículo en varios colores o tamaños. Cada variante es un
            producto con su propio SKU, precio y stock.
          </p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <ProductGroupForm
            categories={categories}
            colors={colors}
            sizes={sizes}
            designs={designs}
            suppliers={suppliers}
            initialData={productGroup}
          />
        </div>
        <GroupWorkspaceAside
          group={productGroup}
          lowStockThreshold={threshold}
        />
      </div>
    </div>
  );
};

export default ProductGroupPage;
