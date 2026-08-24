import { getBusinessGrowthOverview } from "@/lib/business-growth-data";

import { BusinessGrowthClient } from "./components/client";

export const revalidate = 0;

interface BusinessGrowthPageProps {
  params: { storeId: string };
}

export default async function BusinessGrowthPage({
  params,
}: BusinessGrowthPageProps) {
  const overview = await getBusinessGrowthOverview(params.storeId);

  return (
    <BusinessGrowthClient storeId={params.storeId} initialData={overview} />
  );
}
