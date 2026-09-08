import type { Metadata } from "next";

import ShipmentsClient from "./components/client";
import { getDispatchQueue, getShipments } from "./server/get-shipments";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Envíos | PdePapel Admin",
  description: "Despacho del día, envíos en camino y novedades",
};

interface ShipmentsPageProps {
  params: { storeId: string };
}

export default async function ShipmentsPage({ params }: ShipmentsPageProps) {
  const [shipments, dispatch] = await Promise.all([
    getShipments(params.storeId),
    getDispatchQueue(params.storeId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8 sm:pt-6">
      <ShipmentsClient data={shipments} dispatch={dispatch} />
    </div>
  );
}
