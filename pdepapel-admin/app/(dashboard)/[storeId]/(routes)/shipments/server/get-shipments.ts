"use server";

import prismadb from "@/lib/prismadb";
import { ShippingProvider, ShippingStatus } from "@prisma/client";
import { headers } from "next/headers";

interface GetShipmentsParams {
  storeId: string;
  status?: string[];
  provider?: string[];
  carrier?: string[];
}

export async function getShipments(params: GetShipmentsParams | string) {
  headers();

  // Support both old (string) and new (object) signatures
  const storeId = typeof params === "string" ? params : params.storeId;
  const filters: Partial<GetShipmentsParams> =
    typeof params === "string" ? {} : params;

  const where: any = {
    storeId,
    orderId: { not: null }, // Defensive: only get shipments with orders
  };

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status as ShippingStatus[] };
  }

  if (filters.provider && filters.provider.length > 0) {
    where.provider = { in: filters.provider as ShippingProvider[] };
  }

  if (filters.carrier && filters.carrier.length > 0) {
    where.OR = [
      { carrierName: { in: filters.carrier } },
      { courier: { in: filters.carrier } },
    ];
  }

  return await prismadb.shipping.findMany({
    where,
    select: {
      id: true,
      storeId: true,
      trackingCode: true,
      carrierName: true,
      courier: true,
      cost: true,
      status: true,
      provider: true,
      envioClickIdOrder: true,
      envioClickIdRate: true,
      guideUrl: true,
      estimatedDeliveryDate: true,
      createdAt: true,
      updatedAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          fullName: true,
          phone: true,
          address: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
