import { requireStoreRead } from "@/lib/store-access";
import prismadb from "@/lib/prismadb";

/** Ofertas de la tienda con lo que la lista necesita: cuántos destinos, una muestra de nombres y si aún queda algo a la venta. */
export const getOffers = async (storeId: string) => {
  // Ofertas está abierta a solo lectura desde la fase 1; el guardia se declara aquí.
  await requireStoreRead(storeId);
  const offers = await prismadb.offer.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { products: true, categories: true, productGroups: true } },
      products: { select: { product: { select: { name: true, isArchived: true, stock: true } } } },
    },
  });
  return offers.map(({ products, ...offer }) => {
    const live = products.map((row) => row.product).filter((product) => !product.isArchived);
    const sellableProducts = live.filter((product) => product.stock > 0).length;
    const onlyProducts = offer._count.categories === 0 && offer._count.productGroups === 0;
    return {
      ...offer,
      sampleNames: live.slice(0, 3).map((product) => product.name),
      sellableProducts,
      // Vigente en la lista pero sin nada que vender: todos archivados o agotados.
      scopeExhausted: onlyProducts && offer._count.products > 0 && sellableProducts === 0,
    };
  });
};
