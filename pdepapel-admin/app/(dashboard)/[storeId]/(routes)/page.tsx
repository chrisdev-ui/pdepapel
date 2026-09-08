import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { Analytics } from "@/components/analytics";
import { Inventory } from "@/components/inventory";
import { Overview } from "@/components/overview";
import { BrandedLoader } from "@/components/ui/branded-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YearSelector } from "@/components/year-selector";
import { getTodaySummary } from "@/lib/dashboard-today";
import { getColombiaDate } from "@/lib/date-utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PendingActions } from "./components/pending-actions";
import { TodayKpis } from "./components/today-kpis";
import { TopProducts } from "./components/top-products";
import { WeekSummary } from "./components/week-summary";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hoy | PdePapel Admin",
  description: "Lo que necesita tu atención hoy",
};

interface DashboardPageProps {
  params: { storeId: string };
  searchParams: { year?: string };
}

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const year = searchParams.year ? parseInt(searchParams.year) : new Date().getFullYear();
  const [summary, graphRevenue, salesCount] = await Promise.all([
    getTodaySummary(params.storeId),
    getGraphRevenue(params.storeId, year),
    getSalesCount(params.storeId, year),
  ]);
  const local = getColombiaDate(summary.generatedAt);
  const title = `Hoy, ${format(local, "EEEE d 'de' MMMM", { locale: es })}`;
  const updated = format(local, "H:mm");

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary first-letter:uppercase">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Lo que necesita tu atención primero. Cifras de la administración, actualizadas a las {updated}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/${params.storeId}/ventas-rapidas`}>
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            Registrar venta presencial
          </Link>
        </Button>
      </div>

      <TodayKpis storeId={params.storeId} summary={summary} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PendingActions storeId={params.storeId} items={summary.pending} />
        <div className="flex flex-col gap-4">
          <WeekSummary week={summary.week} />
          <TopProducts storeId={params.storeId} items={summary.topProducts} />
        </div>
      </div>

      <section aria-labelledby="mas-analisis" className="flex flex-col gap-3 pt-2">
        <h2 id="mas-analisis" className="text-[15px] font-bold text-primary">Más análisis</h2>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Ventas por año</TabsTrigger>
            <TabsTrigger value="inventory">Inventario</TabsTrigger>
            <TabsTrigger value="analytics">Analíticas</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader className="flex flex-col gap-3">
                <CardTitle>Gráfico de ventas por año</CardTitle>
                <YearSelector />
              </CardHeader>
              <CardContent className="pl-2">
                <Overview data={graphRevenue} year={year} />
              </CardContent>
            </Card>
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
      </section>
    </div>
  );
}
