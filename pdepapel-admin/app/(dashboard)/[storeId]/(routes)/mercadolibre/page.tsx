import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getMercadoLibreConfigurationStatus } from "@/lib/mercadolibre/config";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";

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
  const { userId } = auth();
  if (!userId) redirect("/iniciar-sesion");

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
    <div className="flex-col">
      <div className="flex-1 space-y-6 p-6 md:p-8">
        <MercadoLibreClient
          configuration={getMercadoLibreConfigurationStatus()}
          queueConfiguration={getMercadoLibreQueueConfigurationStatus()}
          connection={connection}
        />
      </div>
    </div>
  );
}
