import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { getStockCount } from "@/actions/get-stock-count";
import { getTotalRevenue } from "@/actions/get-total-revenue";
import { Analytics } from "@/components/analytics";
import { Inventory } from "@/components/inventory";
import { Overview } from "@/components/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YearSelector } from "@/components/year-selector";
import { formatter } from "@/lib/utils";
import { CreditCard, DollarSign, Package } from "lucide-react";
import { Suspense } from "react";

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
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Ingresos Totales
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatter.format(totalRevenue)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Ventas
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">+{salesCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Productos en inventario
                    </CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stockCount}</div>
                  </CardContent>
                </Card>
              </div>
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                  <YearSelector selected={year.toString()} />
                </CardHeader>
                <CardContent className="pl-2">
                  <Overview data={graphRevenue} year={year} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="inventory">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  Cargando...
                </div>
              }
            >
              <Inventory params={params} />
            </Suspense>
          </TabsContent>
          <TabsContent value="analytics">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  Cargando...
                </div>
              }
            >
              <Analytics params={params} year={year} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
