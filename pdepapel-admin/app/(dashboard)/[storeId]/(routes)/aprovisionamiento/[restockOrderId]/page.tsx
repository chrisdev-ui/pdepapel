import { redirect } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { RESTOCK_ORDER_INCLUDE } from "@/lib/restock-orders-db";
import { RestockOrderStatus } from "@prisma/client";

import { RestockOrderDraftForm } from "./components/restock-order-draft-form";
import { RestockOrderWorkspace } from "./components/restock-order-workspace";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function RestockOrderPage({
  params,
  searchParams,
}: {
  params: { restockOrderId: string; storeId: string };
  searchParams?: { recibir?: string; proveedor?: string; producto?: string; cantidad?: string };
}) {
  // La ruta canónica es /nuevo; /new sigue llegando desde enlaces viejos.
  if (params.restockOrderId === "new") redirect(`/${params.storeId}/aprovisionamiento/nuevo`);

  const isNew = NEW_SEGMENTS.has(params.restockOrderId);
  const [restockOrder, suppliers] = await Promise.all([
    isNew
      ? null
      : prismadb.restockOrder.findFirst({
          where: { id: params.restockOrderId, storeId: params.storeId },
          include: RESTOCK_ORDER_INCLUDE,
        }),
    prismadb.supplier.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true, leadTimeDays: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!isNew && !restockOrder) redirect(`/${params.storeId}/aprovisionamiento`);

  // Desde Inventario («Reponer con el proveedor») llegan proveedor y producto
  // sugeridos; solo se usan si pertenecen a la tienda.
  const [prefillSupplier, prefillProduct] = isNew
    ? await Promise.all([
        searchParams?.proveedor
          ? prismadb.supplier.findFirst({ where: { id: searchParams.proveedor, storeId: params.storeId }, select: { id: true } })
          : null,
        searchParams?.producto
          ? prismadb.product.findFirst({
              where: { id: searchParams.producto, storeId: params.storeId, isArchived: false },
              select: { id: true, acqPrice: true, supplierId: true },
            })
          : null,
      ])
    : [null, null];
  const prefill = isNew
    ? {
        supplierId: prefillSupplier?.id ?? prefillProduct?.supplierId ?? null,
        // `cantidad` llega desde Inventario con el sugerido; sin él, una unidad.
        product: prefillProduct
          ? { id: prefillProduct.id, acqPrice: prefillProduct.acqPrice ?? 0, quantity: Math.max(1, Math.floor(Number(searchParams?.cantidad) || 1)) }
          : null,
      }
    : null;

  const draft = !restockOrder || restockOrder.status === RestockOrderStatus.DRAFT;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        {draft ? (
          <RestockOrderDraftForm initialData={restockOrder} suppliers={suppliers} prefill={prefill} />
        ) : (
          <RestockOrderWorkspace order={restockOrder!} openReceive={searchParams?.recibir === "1"} />
        )}
      </div>
    </div>
  );
}
