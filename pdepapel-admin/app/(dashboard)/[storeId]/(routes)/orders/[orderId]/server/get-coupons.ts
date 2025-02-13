"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getCoupons(storeId: string) {
  headers();

  return await prismadb.coupon.findMany({
    where: {
      storeId,
      isActive: true,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
      OR: [
        { maxUses: null },
        {
          AND: [
            { maxUses: { not: null } },
            { usedCount: { lt: prismadb.coupon.fields.maxUses } },
          ],
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
