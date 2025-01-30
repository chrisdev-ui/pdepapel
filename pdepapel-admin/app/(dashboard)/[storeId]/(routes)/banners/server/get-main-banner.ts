"use server";

import prismadb from "@/lib/prismadb";

export async function getMainBanner(storeId: string) {
  const mainBanner = await prismadb.mainBanner.findFirst({
    where: {
      storeId,
    },
  });

  return mainBanner ? [mainBanner] : [];
}
