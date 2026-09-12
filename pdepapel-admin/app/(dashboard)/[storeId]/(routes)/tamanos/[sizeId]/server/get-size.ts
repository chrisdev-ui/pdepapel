"use server";

import prismadb from "@/lib/prismadb";

/** Tamaño para el formulario de edición; `null` si no existe o es de otra tienda. */
export async function getSize(storeId: string, sizeId: string) {
  return await prismadb.size.findFirst({
    where: { id: sizeId, storeId },
  });
}
