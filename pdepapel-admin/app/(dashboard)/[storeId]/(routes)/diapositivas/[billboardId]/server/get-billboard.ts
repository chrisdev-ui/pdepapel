"use server";

import prismadb from "@/lib/prismadb";

export async function getBillboard(billboardId: string) {
  return await prismadb.billboard.findUnique({
    where: {
      id: billboardId,
    },
  });
}
