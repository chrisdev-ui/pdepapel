import { requireStoreOwner } from "@/lib/store-access";
import prismadb from "@/lib/prismadb";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";

export async function getOrdersWithoutGuide(storeId: string) {
  await requireStoreOwner(storeId);
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
      shipping: SHIPPING_WITHOUT_GUIDE_PDF,
    },
  });
}
