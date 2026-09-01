import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import { resolveBusinessGrowthPeriod } from "@/lib/business-growth-period";

import { BusinessGrowthClient } from "./components/client";

export const revalidate = 0;

interface BusinessGrowthPageProps {
  params: { storeId: string };
  searchParams: { month?: string | string[]; year?: string | string[] };
}

export default async function BusinessGrowthPage({
  params,
  searchParams,
}: BusinessGrowthPageProps) {
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
