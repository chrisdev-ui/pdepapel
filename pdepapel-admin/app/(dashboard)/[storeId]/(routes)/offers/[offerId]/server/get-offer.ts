import prismadb from "@/lib/prismadb";

export const getOffer = async (offerId: string) => {
  const offer = await prismadb.offer.findUnique({
    where: {
      id: offerId,
    },
    include: {
      products: true,
      categories: true,
    },
  });

  return offer;
};
