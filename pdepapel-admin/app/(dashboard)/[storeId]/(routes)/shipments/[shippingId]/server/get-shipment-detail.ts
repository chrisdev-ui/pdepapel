"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getShipmentDetail(storeId: string, shippingId: string) {
  headers();

  const shipment = await prismadb.shipping.findUnique({
    where: {
      id: shippingId,
      storeId,
    },
    include: {
      order: {
        include: {
          orderItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                },
              },
            },
          },
          payment: true,
        },
      },
    },
  });

  if (!shipment) {
    throw new Error("Envío no encontrado");
  }

  return shipment;
}
