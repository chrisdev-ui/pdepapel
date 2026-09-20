import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import { resolveBusinessGrowthPeriod } from "@/lib/business-growth-period";
import { requireStoreOwner } from "@/lib/store-access";

import { BusinessGrowthClient } from "./components/client";

export const revalidate = 0;

interface BusinessGrowthPageProps {
  params: { storeId: string };
  searchParams: { month?: string | string[]; year?: string | string[] };
}

/**
 * Solo la dueña: aquí va el dinero de la casa —ventas netas, utilidad,
 * margen por producto y el retiro personal sugerido—. No hay versión
 * depurada para una cuenta de solo lectura; si algún día la agencia
 * necesita cifras, se le hace una vista aparte con unidades y campañas.
 */
export default async function BusinessGrowthPage({
  params,
  searchParams,
}: BusinessGrowthPageProps) {
  await requireStoreOwner(params.storeId);
  const period = resolveBusinessGrowthPeriod(searchParams);
  const overview = await getBusinessGrowthOverview(
    params.storeId,
    period.referenceDate,
  );

  return (
    <BusinessGrowthClient
      key={`${period.year}-${period.month}`}
      storeId={params.storeId}
      initialData={overview}
    />
  );
}
