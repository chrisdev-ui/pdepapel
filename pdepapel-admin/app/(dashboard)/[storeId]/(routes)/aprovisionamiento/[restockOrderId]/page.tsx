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
  searchParams?: { recibir?: string };
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

  const draft = !restockOrder || restockOrder.status === RestockOrderStatus.DRAFT;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        {draft ? (
          <RestockOrderDraftForm initialData={restockOrder} suppliers={suppliers} />
        ) : (
          <RestockOrderWorkspace order={restockOrder!} openReceive={searchParams?.recibir === "1"} />
        )}
      </div>
    </div>
  );
}
