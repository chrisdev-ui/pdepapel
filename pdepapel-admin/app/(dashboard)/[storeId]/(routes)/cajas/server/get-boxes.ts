"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getBoxes(storeId: string) {
  headers();
  const boxes = await prismadb.box.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return boxes;
}
