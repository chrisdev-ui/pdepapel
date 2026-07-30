"use server";

import prismadb from "@/lib/prismadb";

export async function getMainBannerById(mainBannerId: string) {
  return await prismadb.mainBanner.findUnique({
    where: {
      id: mainBannerId,
    },
  });
}
