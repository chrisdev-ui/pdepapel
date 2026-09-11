"use server";

import { getCouponDetail } from "@/lib/coupon-availability";
import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

/** Cupón de la tienda con su uso real y sus últimos pedidos; `null` si no es de esta tienda. */
export async function getCoupon(couponId: string, storeId: string) {
  headers();
  return getCouponDetail(prismadb, storeId, couponId);
}
