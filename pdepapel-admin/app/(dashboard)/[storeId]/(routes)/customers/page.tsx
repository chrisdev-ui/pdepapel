import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";
import CustomerClient from "./components/client";
import { CustomerAnalytics } from "./components/customer-analytics";
import { getCustomers } from "./server/get-customers";

interface CustomerPageProps {
  params: {
    storeId: string;
  };
}

export const metadata: Metadata = {
  title: "Clientes | PdePapel Admin",
  description: "Base de datos de clientes",
};

const CustomerPage: React.FC<CustomerPageProps> = async ({ params }) => {
  const customers = await getCustomers(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Suspense fallback={<AnalyticsLoadingSkeleton />}>
          <CustomerAnalytics storeId={params.storeId} />
        </Suspense>

        <CustomerClient data={customers} />
      </div>
    </div>
  );
};

const AnalyticsLoadingSkeleton = () => {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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

export default CustomerPage;
