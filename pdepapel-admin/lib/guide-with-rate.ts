import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { withResourceLock } from "@/lib/resource-lock";
import { queueShipmentMilestone } from "@/lib/shipment-notifications";
import { createGuideForOrder } from "@/lib/shipping-helpers";

export interface GuideRate {
  idRate: number;
  carrier: string;
  product: string;
  totalCost: number;
  flete: number;
  minimumInsurance: number;
}

/**
 * Crear la guía con una tarifa ya elegida: lo que hacen «Recotizar y crear
 * guía» y «/confirmar» por WhatsApp, en un solo camino. Crear una guía cobra:
 * va bajo el candado del pedido, vuelve a mirar que no exista una, y solo
 * entonces escribe la tarifa en el envío. El aviso «ya tiene guía» a la
 * clienta sale con las reglas de siempre (`queueShipmentMilestone`).
 */
export async function createGuideWithRate(input: { orderId: string; storeId: string; shippingId: string; rate: GuideRate; source: string }) {
  const result = await withResourceLock(
    `guide:${input.orderId}`,
    "Ya se está creando la guía de este pedido. Espera unos segundos y recarga la página.",
    async () => {
      const fresh = await prismadb.shipping.findUnique({ where: { id: input.shippingId }, select: { envioClickIdOrder: true } });
      if (fresh?.envioClickIdOrder) throw ErrorFactory.Conflict("La orden ya tiene una guía creada");
      await prismadb.shipping.update({
        where: { id: input.shippingId },
        data: {
          envioClickIdRate: input.rate.idRate,
          carrierName: input.rate.carrier,
          courier: input.rate.carrier,
          productName: input.rate.product,
          cost: input.rate.totalCost,
          flete: input.rate.flete,
          minimumInsurance: input.rate.minimumInsurance,
        },
      });
      return createGuideForOrder(input.orderId, input.storeId);
    },
  );
  queueShipmentMilestone({ orderId: input.orderId, storeId: input.storeId, milestone: "guia_creada", source: input.source });
  return result;
}
