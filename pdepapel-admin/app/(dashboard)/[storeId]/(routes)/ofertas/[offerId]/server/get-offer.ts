import { requireStoreRead } from "@/lib/store-access";
import prismadb from "@/lib/prismadb";

/** Oferta de la tienda con sus destinos; `null` si no existe o es de otra tienda. */
export const getOffer = async (offerId: string, storeId: string) => {
  // Ofertas está abierta a solo lectura desde la fase 1; el guardia se declara aquí.
  await requireStoreRead(storeId);
  return prismadb.offer.findFirst({
    where: { id: offerId, storeId },
    include: { products: true, categories: true, productGroups: true },
  });
};
