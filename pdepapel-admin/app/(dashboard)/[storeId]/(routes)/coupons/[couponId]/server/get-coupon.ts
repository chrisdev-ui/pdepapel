"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getCoupon(couponId: string, storeId: string) {
  headers();
  return await prismadb.coupon.findUnique({
    where: {
      id: couponId,
      storeId,
    },
  });
}
