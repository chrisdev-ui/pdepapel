"use server";

import prismadb from "@/lib/prismadb";

export async function getBanners(storeId: string) {
  return await prismadb.banner.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      imageUrl: true,
      callToAction: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
