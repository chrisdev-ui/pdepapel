"use server";

import prismadb from "@/lib/prismadb";

export async function getBanner(bannerId: string) {
  return await prismadb.banner.findUnique({
    where: {
      id: bannerId,
    },
  });
}
