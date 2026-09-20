import { SUPPLIER_PICKER_SELECT } from "@/lib/public-catalog";
import { requireStoreRead } from "@/lib/store-access";
import { scrubProductGroup } from "@/lib/viewer-payloads";
import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import { notFound } from "next/navigation";
import { ProductGroupForm } from "../../components/product-group-form";
import { env } from "@/lib/env.mjs";
import { GroupWorkspaceAside } from "./components/group-workspace";

const ProductGroupPage = async ({
  params,
}: {
  params: { storeId: string; productGroupId: string };
}) => {
  // Solo lectura: las variantes traen `include` sin `select`, o sea todos los
  // escalares del producto —costo de compra, transporte, proveedor—. La ruta de
  // API ya las depuraba con `scrubProductGroup`; esta página no, y sí la ve una
  // cuenta de solo lectura.
  const access = await requireStoreRead(params.storeId);

  // Acotado a la tienda: un id ajeno o inexistente responde 404 en vez de
  // pintar el formulario de creación bajo una URL de edición.
  const productGroupRaw = await prismadb.productGroup.findFirst({
    where: {
      id: params.productGroupId,
      storeId: params.storeId,
    },
    include: {
      images: true,
      // Solo el conteo: «Desagrupar» dice cuántas ofertas del grupo pasan a cada variante.
      offers: { select: { offerId: true } },
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

  const productGroup =
    access.role === "viewer" ? scrubProductGroup(productGroupRaw) : productGroupRaw;

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
      prismadb.supplier.findMany({
        where: { storeId: params.storeId },
        select: SUPPLIER_PICKER_SELECT,
      }),
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
      {/* Un solo encabezado: lo pinta el formulario (FormPageHeader). */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <ProductGroupForm
            categories={categories}
            colors={colors}
            sizes={sizes}
            designs={designs}
            suppliers={suppliers}
            initialData={productGroup}
            storeUrl={env.FRONTEND_STORE_URL}
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
