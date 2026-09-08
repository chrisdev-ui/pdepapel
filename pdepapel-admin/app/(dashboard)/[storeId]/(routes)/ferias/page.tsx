import type { Metadata } from "next";

import prismadb from "@/lib/prismadb";

import { FairEventsClient } from "./components/fair-events-client";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ferias | PdePapel Admin",
  description: "Reservas de stock, ventas en feria y conciliación",
};

export default async function FairEventsPage({ params }: { params: { storeId: string } }) {
  const fairs = await prismadb.fairEvent.findMany({
    where: { storeId: params.storeId },
    include: {
      inventoryItems: { select: { allocatedQuantity: true, soldQuantity: true } },
      orders: { select: { total: true } },
      _count: { select: { capsules: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <FairEventsClient
        data={fairs.map((fair) => ({
          id: fair.id,
          name: fair.name,
          location: fair.location,
          startsAt: fair.startsAt?.toISOString() || null,
          endsAt: fair.endsAt?.toISOString() || null,
          status: fair.status,
          totalAllocated: fair.inventoryItems.reduce((total, item) => total + item.allocatedQuantity, 0),
          totalSold: fair.inventoryItems.reduce((total, item) => total + item.soldQuantity, 0),
          salesTotal: fair.orders.reduce((total, order) => total + Number(order.total), 0),
          capsules: fair._count.capsules,
        }))}
      />
    </div>
  );
}
