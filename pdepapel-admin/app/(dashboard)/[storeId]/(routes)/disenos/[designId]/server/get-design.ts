"use server";

import prismadb from "@/lib/prismadb";

/** Diseño para el formulario de edición; `null` si no existe o es de otra tienda. */
export async function getDesign(storeId: string, designId: string) {
  return await prismadb.design.findFirst({
    where: { id: designId, storeId },
  });
}
