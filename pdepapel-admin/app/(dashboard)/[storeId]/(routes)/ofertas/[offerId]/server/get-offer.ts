import prismadb from "@/lib/prismadb";

/** Oferta de la tienda con sus destinos; `null` si no existe o es de otra tienda. */
export const getOffer = async (offerId: string, storeId: string) => {
  return prismadb.offer.findFirst({
    where: { id: offerId, storeId },
    include: { products: true, categories: true, productGroups: true },
  });
};
