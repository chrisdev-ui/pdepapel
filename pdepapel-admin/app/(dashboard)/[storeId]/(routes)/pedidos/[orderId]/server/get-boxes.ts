"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getBoxes(storeId: string) {
  headers();
  return await prismadb.box.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
