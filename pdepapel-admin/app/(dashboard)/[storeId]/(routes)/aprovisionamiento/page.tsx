import type { Metadata } from "next";
import dynamicImport from "next/dynamic";

import prismadb from "@/lib/prismadb";
import { getRestockOrders } from "./server/get-restock-orders";

const RestockOrderClient = dynamicImport(() => import("./components/client"), { ssr: false });

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Aprovisionamiento | PdePapel Admin",
  description: "Pedidos a proveedores y recepción de mercancía",
};

export default async function RestockOrdersPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams?: { proveedor?: string };
}) {
  const supplierId = searchParams?.proveedor?.trim() || null;
  const [restockOrders, supplier] = await Promise.all([
    getRestockOrders(params.storeId, supplierId),
    supplierId
      ? prismadb.supplier.findFirst({ where: { id: supplierId, storeId: params.storeId }, select: { id: true, name: true } })
      : null,
  ]);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <RestockOrderClient data={restockOrders} supplierFilter={supplier} />
      </div>
    </div>
  );
}
