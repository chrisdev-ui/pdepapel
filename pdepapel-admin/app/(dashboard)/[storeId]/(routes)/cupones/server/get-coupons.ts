"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

/** Cupones de la tienda con cuántos pedidos referencia cada uno (decide si se puede eliminar). */
export async function getCoupons(storeId: string) {
  await requireStoreRead(storeId);
  headers();

  const coupons = await prismadb.coupon.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } },
  });
  return coupons.map(({ _count, ...coupon }) => ({ ...coupon, ordersCount: _count.orders }));
}
