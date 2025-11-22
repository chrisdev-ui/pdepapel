import prismadb from "@/lib/prismadb";

export async function getOrdersWithoutGuide(storeId: string) {
  return await prismadb.order.findMany({
    where: {
      storeId: storeId,
      status: "PAID",
      shipping: {
        is: {
          envioClickIdRate: { not: null },
          envioClickIdOrder: null, // Sin guía creada
        },
      },
    },
    include: {
      shipping: true,
    },
  });
}
