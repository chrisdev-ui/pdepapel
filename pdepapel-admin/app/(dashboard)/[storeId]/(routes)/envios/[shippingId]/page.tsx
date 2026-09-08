import { redirect } from "next/navigation";

import prismadb from "@/lib/prismadb";

export const revalidate = 0;

interface ShipmentDetailPageProps {
  params: { storeId: string; shippingId: string };
}

/**
 * El detalle de un envío vive en la sección Envío de su pedido (rediseño
 * 2026-09). Esta ruta se conserva solo para no romper enlaces guardados.
 */
export default async function ShipmentDetailPage({ params }: ShipmentDetailPageProps) {
  const shipment = await prismadb.shipping.findFirst({
    where: { id: params.shippingId, storeId: params.storeId },
    select: { orderId: true },
  });
  if (!shipment) redirect(`/${params.storeId}/envios`);
  redirect(`/${params.storeId}/pedidos/${shipment.orderId}#envio`);
}
