import {
  getCustomerIntelligence,
  getInactiveCustomersEligibleForReactivation,
} from "@/actions/get-customer-intelligence";
import {
  getDailyFinancialBreakdown,
  getMonthOverMonthComparison,
} from "@/actions/get-financial-analytics";
import { getInventoryRisk } from "@/actions/get-inventory-risk";
import {
  getDeadInventory,
  getProductProfitRanking,
} from "@/actions/get-product-profitability";
import { BiDailyChart } from "@/components/bi/bi-daily-chart";
import { BiKpiCards } from "@/components/bi/bi-kpi-cards";
import { BiMonthPicker } from "@/components/bi/bi-month-picker";
import { BiRiskDrilldown } from "@/components/bi/bi-risk-drilldown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { currencyFormatter } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Info } from "lucide-react";

interface BIDashboardPageProps {
  params: { storeId: string };
  searchParams: { month?: string; year?: string };
}

export default async function BIDashboardPage({
  params,
  searchParams,
}: BIDashboardPageProps) {
  const storeId = params.storeId;

  // Parse requested date or default to now
  const requestedYear = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const requestedMonth = searchParams.month
    ? parseInt(searchParams.month) - 1
    : new Date().getMonth();
  const now = new Date(requestedYear, requestedMonth, 1);

  // 1. Financial Analytics
  const momData = await getMonthOverMonthComparison(
    storeId,
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const dailyData = await getDailyFinancialBreakdown(
    storeId,
    now.getFullYear(),
    now.getMonth() + 1,
  );

  // 2. Product Capital Efficiency
  const topProducts = await getProductProfitRanking(
    storeId,
    now.getFullYear(),
    now.getMonth() + 1,
    5,
  );
  const deadInventoryCount = await getDeadInventory(storeId, 60);

  // 3. Smart Inventory Risk
  const stockoutRisks = await getInventoryRisk(storeId);
  const criticalStockoutsItems = stockoutRisks.filter(
    (r: any) => r.daysUntilStockout !== null && r.daysUntilStockout < 7,
  );
  const criticalStockoutsCount = criticalStockoutsItems.length;

  // 4. Customer Intelligence
  const customerSegments = await getCustomerIntelligence(storeId);
  const VIPItems = customerSegments.filter((c: any) => c.segment === "VIP");
  const VIPcount = VIPItems.length;
  const inactives = await getInactiveCustomersEligibleForReactivation(
    storeId,
    90,
  );

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <Heading
            title={`Inteligencia de Negocios`}
            description={`Métricas avanzadas (Rendimiento de ${format(now, "MMMM 'de' yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase())})`}
          />
          <BiMonthPicker currentDate={now} />
        </div>
        <Separator />

        {/* Top KPIs */}
        <BiKpiCards data={momData} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Main Chart */}
          <div className="col-span-1 lg:col-span-4">
            <BiDailyChart data={dailyData} />
          </div>

          {/* Quick Risk Counters / Segments */}
          <Card className="col-span-1 lg:col-span-3">
            <CardHeader>
              <CardTitle>Riesgos y Oportunidades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">Inventario Muerto (60+ días)</p>
                  <p className="text-sm text-muted-foreground">
                    Capital inmovilizado
                  </p>
                </div>
                <BiRiskDrilldown
                  type="dead_stock"
                  count={deadInventoryCount.length}
                  data={deadInventoryCount}
                />
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">Riesgo Inminente de Stockout</p>
                  <p className="text-sm text-muted-foreground">
                    Agotamiento en &lt; 7 días
                  </p>
                </div>
                <BiRiskDrilldown
                  type="stockout"
                  count={criticalStockoutsCount}
                  data={criticalStockoutsItems}
                />
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">Clientes Inactivos (90 días)</p>
                  <p className="text-sm text-muted-foreground">
                    Listos para reactivación
                  </p>
                </div>
                <BiRiskDrilldown
                  type="inactive"
                  count={inactives.length}
                  data={inactives}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Clientes VIP</p>
                  <p className="text-sm text-muted-foreground">
                    Top 20% de LTV
                  </p>
                </div>
                <BiRiskDrilldown type="vip" count={VIPcount} data={VIPItems} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table Sections */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Top Products */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <CardTitle>Top 5 Productos (Por Beneficio)</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px]">
                      <p>
                        Rango de rentabilidad real por producto. Se calcula
                        sumando la ganancia neta final de cada pedido (restando
                        comisiones y envío) y repartiéndola de forma
                        proporcional según el peso del producto en la compra.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <BiRiskDrilldown
                type="top_products"
                count={topProducts.length}
                data={topProducts}
              />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProducts.slice(0, 5).map((p: any, index: number) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-4 font-bold text-muted-foreground">
                        {index + 1}
                      </div>
                      <div>
                        <p className="max-w-full font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Margen: {p.profitMarginPct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {currencyFormatter(p.totalProfit)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bottom Products or specific actionable insight */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <CardTitle>Alertas de Inventario (ABC / Dead Stock)</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px]">
                      <p>
                        <strong>Clasificación ABC:</strong> Segrega tu
                        inventario según su rotación (A = Alta, B = Media, C =
                        Baja).
                        <br />
                        <br />
                        <strong>Dead Stock:</strong> Son tus peores productos en
                        la categoría C. Artículos que ocupan espacio y llevan
                        más de 60 días sin venderse, inmovilizando tu capital.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <BiRiskDrilldown
                type="dead_stock"
                count={deadInventoryCount.length}
                data={deadInventoryCount}
              />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deadInventoryCount.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="max-w-full font-medium text-red-500">
                        {p.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Stock: {p.stock} uni.
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      {p.daysSinceLastSale !== null ? (
                        <span>Última venta: {p.daysSinceLastSale} días</span>
                      ) : (
                        <span className="text-xs font-semibold text-red-500">
                          Nunca vendido
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {deadInventoryCount.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Excelente salud de inventario. Todo está en movimiento.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
