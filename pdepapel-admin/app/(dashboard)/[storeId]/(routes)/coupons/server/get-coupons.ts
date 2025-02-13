"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getCoupons(storeId: string) {
  headers();

  return await prismadb.coupon.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
