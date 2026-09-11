"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

/**
 * Caja de una tienda con cuántos envíos la referencian. Devuelve `null` cuando
 * el id no existe o pertenece a otra tienda.
 */
export async function getBox(boxId: string, storeId: string) {
  headers();
  const box = await prismadb.box.findFirst({
    where: {
      id: boxId,
      storeId,
    },
  });
  if (!box) return null;

  const shipmentsCount = await prismadb.shipping.count({
    where: { boxId: box.id },
  });

  return { box, shipmentsCount };
}
