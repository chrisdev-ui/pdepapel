import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { getStockCount } from "@/actions/get-stock-count";
import { getTotalRevenue } from "@/actions/get-total-revenue";
import { Analytics } from "@/components/analytics";
import { Inventory } from "@/components/inventory";
import { Overview } from "@/components/overview";
import { BrandedLoader } from "@/components/ui/branded-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { SensitiveDataCard } from "@/components/ui/sensitive-data-card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YearSelector } from "@/components/year-selector";
import { CreditCard, Package } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Panel de Control | PdePapel Admin",
  description: "Resumen de tu tienda",
};

interface DashboardPageProps {
  params: { storeId: string };
  searchParams: { year?: string };
}

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const graphRevenue = await getGraphRevenue(params.storeId, year);
  const salesCount = await getSalesCount(params.storeId, year);
  const stockCount = await getStockCount(params.storeId);
  const totalRevenue = await getTotalRevenue(params.storeId, year);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Heading
          title="Tablero de control"
          description="Resumen de tu tienda"
        />
        <Separator />
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="inventory">Inventario</TabsTrigger>
            <TabsTrigger value="analytics">Analíticas</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SensitiveDataCard
                  id="total-revenue"
                  title="Ingresos Totales"
                  value={totalRevenue}
                />
                <SensitiveDataCard
                  id="total-orders"
                  title="Ventas"
                  value={salesCount.totalSales}
                  format="number"
                  icon={
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  }
                />
                <SensitiveDataCard
                  id="total-products"
                  title="Productos en inventario"
                  value={stockCount}
                  format="number"
                  icon={<Package className="h-4 w-4 text-muted-foreground" />}
                />
              </div>
              <Card className="col-span-4">
                <CardHeader className="flex flex-col gap-3">
                  <CardTitle>Gráfico de ventas por año</CardTitle>
                  <YearSelector />
                </CardHeader>
                <CardContent className="pl-2">
                  <Overview data={graphRevenue} year={year} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="inventory">
            <Suspense fallback={<BrandedLoader />}>
              <Inventory params={params} />
            </Suspense>
          </TabsContent>
          <TabsContent value="analytics">
            <Suspense fallback={<BrandedLoader />}>
              <Analytics params={params} year={year} salesData={salesCount} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
