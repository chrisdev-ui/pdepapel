import type { Metadata } from "next";

import { getSocialDashboard } from "@/lib/social/access";
import { requireStoreOwner } from "@/lib/store-access";

import { SocialMetricsClient } from "./components/social-metrics-client";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Métricas de redes | PdePapel Admin",
  description: "Vistas, alcance e interacción de las publicaciones de Instagram y TikTok de P de Papel",
};

const PERIODS = [7, 30, 90] as const;

/** Solo la dueña. Lee la base; las cifras llegan de la sincronización en segundo plano. */
export default async function SocialMetricsPage({ params, searchParams }: { params: { storeId: string }; searchParams: { dias?: string; tiktok?: string; motivo?: string } }) {
  await requireStoreOwner(params.storeId);
  const requested = Number(searchParams.dias);
  const days = PERIODS.includes(requested as (typeof PERIODS)[number]) ? requested : 30;
  const data = await getSocialDashboard(params.storeId, days);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <SocialMetricsClient storeId={params.storeId} data={data} periods={[...PERIODS]} tiktokResult={searchParams.tiktok ?? null} tiktokReason={searchParams.motivo ?? null} />
    </div>
  );
}
