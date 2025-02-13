"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getOrders(storeId: string) {
  headers();
  return await prismadb.order.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      orderNumber: true,
      fullName: true,
      phone: true,
      address: true,
      documentId: true,
      total: true,
      status: true,
      createdAt: true,
      orderItems: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              images: true,
            },
          },
          quantity: true,
        },
      },
      shipping: {
        select: {
          status: true,
        },
      },
      payment: {
        select: {
          method: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
