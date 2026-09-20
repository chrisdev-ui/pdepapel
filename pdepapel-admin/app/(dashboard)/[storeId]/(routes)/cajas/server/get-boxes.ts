"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

/** Cajas de la tienda con cuántos envíos usa cada una (para la tabla de Ajustes). */
export async function getBoxes(storeId: string) {
  await requireStoreRead(storeId);
  headers();
  const boxes = await prismadb.box.findMany({
    where: {
      storeId,
    },
    include: {
      _count: { select: { shippings: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return boxes.map(({ _count, ...box }) => ({
    ...box,
    shipmentsCount: _count.shippings,
  }));
}
