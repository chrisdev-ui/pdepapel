import { MarketplaceProvider } from "@prisma/client";
import type { Metadata } from "next";

import { getMercadoLibreConfigurationStatus } from "@/lib/mercadolibre/config";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

import MercadoLibreClient from "./components/client";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mercado Libre | P de Papel Admin",
  description: "Conecta y administra las ventas de Mercado Libre",
};

export default async function MercadoLibrePage({
  params,
}: {
  params: { storeId: string };
}) {
  // Solo la dueña. Antes esto comprobaba únicamente que hubiera sesión, así
  // que una cuenta de solo lectura entraba escribiendo la dirección aunque el
  // menú escondiera la entrada: esconder no es cerrar. El guardia va ANTES de
  // cualquier consulta, para que una sesión sin permiso no dispare ni una.
  await requireStoreOwner(params.storeId);

  const connection = await prismadb.marketplaceConnection.findUnique({
    where: {
      storeId_provider: {
        storeId: params.storeId,
        provider: MarketplaceProvider.MERCADOLIBRE,
      },
    },
    select: {
      sellerId: true,
      siteId: true,
      status: true,
      lastSyncedAt: true,
      lastError: true,
      recoveryScheduleId: true,
      updatedAt: true,
    },
  });
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <MercadoLibreClient
        configuration={getMercadoLibreConfigurationStatus()}
        queueConfiguration={getMercadoLibreQueueConfigurationStatus()}
        connection={connection}
      />
    </div>
  );
}
