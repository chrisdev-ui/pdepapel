"use server";

import prismadb from "@/lib/prismadb";
import { ShippingStatus, ShippingProvider } from "@prisma/client";
import { headers } from "next/headers";

export async function getShippingAnalytics(storeId: string) {
  headers();

  // Fetch all shipments with minimal data for calculations
  const shipments = await prismadb.shipping.findMany({
    where: { storeId },
    select: {
      id: true,
      status: true,
      provider: true,
      cost: true,
      carrierName: true,
      courier: true,
      createdAt: true,
      estimatedDeliveryDate: true,
    },
  });

  // Calculate metrics
  const totalShipments = shipments.length;

  const byStatus = shipments.reduce(
    (acc, shipment) => {
      acc[shipment.status] = (acc[shipment.status] || 0) + 1;
      return acc;
    },
    {} as Record<ShippingStatus, number>,
  );

  const byProvider = shipments.reduce(
    (acc, shipment) => {
      acc[shipment.provider] = (acc[shipment.provider] || 0) + 1;
      return acc;
    },
    {} as Record<ShippingProvider, number>,
  );

  const totalShippingCost = shipments.reduce(
    (sum, s) => sum + (s.cost || 0),
    0,
  );
  const averageShippingCost =
    totalShipments > 0 ? totalShippingCost / totalShipments : 0;

  // Active shipments (in transit, not delivered/cancelled/returned)
  const activeStatuses: ShippingStatus[] = [
    ShippingStatus.Preparing,
    ShippingStatus.Shipped,
    ShippingStatus.PickedUp,
    ShippingStatus.InTransit,
    ShippingStatus.OutForDelivery,
  ];
  const activeShipments = shipments.filter((s) =>
    activeStatuses.includes(s.status),
  ).length;

  // Delivered shipments
  const deliveredShipments = byStatus[ShippingStatus.Delivered] || 0;

  // Delivery rate
  const deliveryRate =
    totalShipments > 0 ? (deliveredShipments / totalShipments) * 100 : 0;

  // Failed deliveries
  const failedDeliveries =
    (byStatus[ShippingStatus.FailedDelivery] || 0) +
    (byStatus[ShippingStatus.Returned] || 0) +
    (byStatus[ShippingStatus.Exception] || 0);

  // Top carriers
  const carrierCounts = shipments.reduce(
    (acc, shipment) => {
      const carrier = shipment.carrierName || shipment.courier || "Sin asignar";
      acc[carrier] = (acc[carrier] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topCarriers = Object.entries(carrierCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([carrier, count]) => ({ carrier, count }));

  // This month's shipments
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthShipments = shipments.filter(
    (s) => new Date(s.createdAt) >= firstDayOfMonth,
  ).length;

  // Last 30 days trend
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const last30DaysShipments = shipments.filter(
    (s) => new Date(s.createdAt) >= thirtyDaysAgo,
  ).length;

  return {
    totalShipments,
    activeShipments,
    deliveredShipments,
    deliveryRate: Math.round(deliveryRate * 10) / 10, // 1 decimal
    failedDeliveries,
    totalShippingCost: Math.round(totalShippingCost * 100) / 100,
    averageShippingCost: Math.round(averageShippingCost),
    byStatus,
    byProvider,
    topCarriers,
    thisMonthShipments,
    last30DaysShipments,
  };
}
