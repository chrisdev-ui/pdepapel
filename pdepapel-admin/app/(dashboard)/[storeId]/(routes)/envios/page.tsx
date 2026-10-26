import type { Metadata } from "next";

import { listOrphanGuides } from "@/lib/orphan-guides";
import prismadb from "@/lib/prismadb";
import { getStoreAccess } from "@/lib/store-access";

import ShipmentsClient from "./components/client";
import { OrphanGuidesCard } from "./components/orphan-guides-card";
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
  // La cola de despacho es la lista de recogida: nombres y direcciones. Se
  // pide solo si la sesión puede verla, en vez de dejar que reviente dentro de
  // un `Promise.all` y se lleve por delante la página entera.
  const access = await getStoreAccess(params.storeId);
  const canWrite = access?.role === "owner";
  const [shipments, dispatch, orphanGuides] = await Promise.all([
    getShipments(params.storeId),
    canWrite ? getDispatchQueue(params.storeId) : Promise.resolve([]),
    canWrite ? listOrphanGuides(prismadb, params.storeId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8 sm:pt-6">
      <OrphanGuidesCard storeId={params.storeId} guides={orphanGuides} />
      <ShipmentsClient data={shipments} dispatch={dispatch} />
    </div>
  );
}
