import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { CacheManagement } from "./components/cache-management";
import ShipmentsClient from "./components/client";
import { ShippingAnalytics } from "./components/shipping-analytics";
import { getShipments } from "./server/get-shipments";

export const revalidate = 0;

interface ShipmentsPageProps {
  params: {
    storeId: string;
  };
  searchParams: {
    status?: string;
    provider?: string;
    carrier?: string;
  };
}

export default async function ShipmentsPage({
  params,
  searchParams,
}: ShipmentsPageProps) {
  const shipments = await getShipments({
    storeId: params.storeId,
    status: searchParams.status?.split(","),
    provider: searchParams.provider?.split(","),
    carrier: searchParams.carrier?.split(","),
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Suspense fallback={<AnalyticsLoadingSkeleton />}>
          <ShippingAnalytics storeId={params.storeId} />
        </Suspense>

        <CacheManagement />

        <ShipmentsClient data={shipments} />
      </div>
    </div>
  );
}

const AnalyticsLoadingSkeleton = () => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-2 h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
