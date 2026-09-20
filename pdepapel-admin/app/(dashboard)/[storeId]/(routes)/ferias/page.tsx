import type { Metadata } from "next";

import { FairEventsClient } from "./components/fair-events-client";
import { getFairEvents } from "./server/get-fair-events";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ferias | PdePapel Admin",
  description: "Reservas de stock, ventas en feria y conciliación",
};

/**
 * La lista de ferias no enseña costos, así que la ve también una cuenta de
 * solo lectura; el guardia vive en la carga, junto a la consulta.
 *
 * La vista (`?vista=`) se resuelve en el servidor: antes se traían todas las
 * ferias y el navegador escondía las que no tocaban.
 */
export default async function FairEventsPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams?: { vista?: string };
}) {
  const { view, counts, metrics, fairs } = await getFairEvents(params.storeId, searchParams?.vista);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <FairEventsClient data={fairs} view={view} counts={counts} metrics={metrics} />
    </div>
  );
}
