"use server";

import prismadb from "@/lib/prismadb";

/** Color para el formulario de edición; `null` si no existe o es de otra tienda. */
export async function getColor(storeId: string, colorId: string) {
  return await prismadb.color.findFirst({
    where: { id: colorId, storeId },
  });
}
