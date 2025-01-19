"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getBanners(storeId: string) {
  const banners = await prismadb.banner.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return banners.map((banner) => ({
    id: banner.id,
    imageUrl: banner.imageUrl,
    callToAction: banner.callToAction,
    createdAt: format(banner.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
