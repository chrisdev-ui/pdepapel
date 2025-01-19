"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";

export async function getMainBanner(storeId: string) {
  const mainBanner = await prismadb.mainBanner.findFirst({
    where: {
      storeId,
    },
  });

  return mainBanner
    ? [
        {
          id: mainBanner.id,
          title: mainBanner.title ?? "Sin definir",
          label1: mainBanner.label1 ?? "Sin definir",
          highlight: mainBanner.highlight ?? "Sin definir",
          label2: mainBanner.label2 ?? "Sin definir",
          imageUrl: mainBanner.imageUrl,
          callToAction: mainBanner.callToAction,
          createdAt: format(mainBanner.createdAt, "MMMM d, yyyy"),
        },
      ]
    : [];
}
