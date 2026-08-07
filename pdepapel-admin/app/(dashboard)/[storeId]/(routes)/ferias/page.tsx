import prismadb from "@/lib/prismadb";

import { FairEventsClient } from "./components/fair-events-client";

export const revalidate = 0;

export default async function FairEventsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const fairs = await prismadb.fairEvent.findMany({
    where: { storeId: params.storeId },
    include: {
      inventoryItems: {
        select: {
          allocatedQuantity: true,
          soldQuantity: true,
        },
      },
      orders: {
        select: { total: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="flex-col">
      <div className="flex-1 p-4 pt-6 sm:p-8 sm:pt-6">
        <FairEventsClient
          data={fairs.map((fair) => ({
            id: fair.id,
            name: fair.name,
            location: fair.location,
            startsAt: fair.startsAt?.toISOString() || null,
            endsAt: fair.endsAt?.toISOString() || null,
            status: fair.status,
            totalAllocated: fair.inventoryItems.reduce(
              (total, item) => total + item.allocatedQuantity,
              0,
            ),
            totalSold: fair.inventoryItems.reduce(
              (total, item) => total + item.soldQuantity,
              0,
            ),
            salesTotal: fair.orders.reduce(
              (total, order) => total + order.total,
              0,
            ),
          }))}
        />
      </div>
    </div>
  );
}
