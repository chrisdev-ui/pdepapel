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
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { getColombiaDate } from "@/lib/date-utils";
import {
  OFFER_PRESELECTION_LIMIT,
  buildOfferPreselectionHref,
} from "@/lib/offer-preselection";
import { currencyFormatter } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import { BiChannelBreakdown } from "./bi-channel-breakdown";

interface BIDashboardPageProps {
  params: { storeId: string };
  searchParams: { month?: string; year?: string };
}

export async function BiDashboard({
  params,
  searchParams,
}: BIDashboardPageProps) {
  const storeId = params.storeId;

  // Use Colombia timezone to determine the current date — the server may
  // run in UTC, which can be a different calendar day than Bogotá (UTC-5).
  const colombiaToday = getColombiaDate();
  const requestedYear = searchParams.year
    ? parseInt(searchParams.year)
    : colombiaToday.getFullYear();
  const requestedMonth = searchParams.month
    ? parseInt(searchParams.month) - 1
    : colombiaToday.getMonth();
  const now = new Date(requestedYear, requestedMonth, 1);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  /*
    Las seis consultas iban una detrás de otra, cada una esperando a que
    terminara la anterior: seis viajes en fila para datos que no dependen
    entre sí. No hay motivo, y esta pestaña ya era la más lenta de las tres.
  */
  const [
    momData,
    dailyData,
    topProducts,
    deadInventory,
    stockoutRisks,
    customerSegments,
    inactives,
  ] = await Promise.all([
    getMonthOverMonthComparison(storeId, year, month),
    getDailyFinancialBreakdown(storeId, year, month),
    getProductProfitRanking(storeId, year, month, 5),
    getDeadInventory(storeId, 60),
    getInventoryRisk(storeId),
    getCustomerIntelligence(storeId),
    getInactiveCustomersEligibleForReactivation(storeId, 90),
  ]);

  const criticalStockouts = stockoutRisks.filter(
    (risk: any) => risk.daysUntilStockout !== null && risk.daysUntilStockout < 7,
  );
  const vipCustomers = customerSegments.filter(
    (customer: any) => customer.segment === "VIP",
  );

  // Use the 15th of the month for display formatting to avoid timezone
  // boundary issues (midnight UTC on the 1st = previous month in UTC-5).
  const displayDate = new Date(requestedYear, requestedMonth, 15);
  const periodLabel = format(displayDate, "MMMM 'de' yyyy", { locale: es });

  const riesgos = [
    {
      key: "dead_stock" as const,
      title: "Sin rotación hace 60 días",
      note: "Ocupan espacio y tienen tu plata quieta",
      data: deadInventory,
    },
    {
      key: "stockout" as const,
      title: "Se agotan en menos de 7 días",
      note: "Pídelos antes de quedarte sin nada",
      data: criticalStockouts,
    },
    {
      key: "inactive" as const,
      title: "Clientes que no compran hace 90 días",
      note: "Se les puede escribir",
      data: inactives,
    },
    {
      key: "vip" as const,
      title: "Tus mejores clientes",
      note: "Los que más han comprado",
      data: vipCustomers,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-foreground">
          Productos, riesgos y clientes de{" "}
          <strong className="text-primary">{periodLabel}</strong>.
        </p>
        <div className="min-w-0 shrink-0 overflow-x-auto">
          <BiMonthPicker
            activeYear={requestedYear}
            activeMonth={requestedMonth}
          />
        </div>
      </div>

      <BiKpiCards data={momData} />

      <BiChannelBreakdown
        channels={momData.currentMonth.byChannel}
        totalRevenue={momData.currentMonth.total_revenue}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <BiDailyChart data={dailyData} />
        </div>

        <SectionCard
          id="bi-riesgos"
          title="Qué necesita tu atención"
          description="Cada uno abre su lista, y desde ahí se llega al producto o al cliente."
          className="lg:col-span-3"
        >
          <ul className="flex flex-col">
            {riesgos.map((riesgo) => (
              <li
                key={riesgo.key}
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    {riesgo.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{riesgo.note}</p>
                </div>
                <BiRiskDrilldown
                  type={riesgo.key}
                  count={riesgo.data.length}
                  data={riesgo.data}
                />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          id="bi-top-productos"
          title="Los que más te dejan"
          description={`Ganancia real de ${periodLabel}, ya descontadas comisiones y envío.`}
          action={
            topProducts.length > 0 ? (
              <BiRiskDrilldown
                type="top_products"
                count={topProducts.length}
                data={topProducts}
              />
            ) : undefined
          }
        >
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay ventas con costo cargado en {periodLabel}.
            </p>
          ) : (
            <ul className="flex flex-col">
              {topProducts.slice(0, 5).map((product: any, index: number) => (
                <li key={product.productId}>
                  <Link
                    href={`/${storeId}/productos/${product.productId}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                  >
                    <span className="w-4 shrink-0 text-xs font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-primary underline-offset-2 hover:underline">
                        {product.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {product.profitMarginPct.toFixed(1)} % de margen
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                      {currencyFormatter(product.totalProfit)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          id="bi-sin-rotacion"
          title="Productos sin rotación"
          description="Llevan más de 60 días sin venderse. Abre el que quieras para bajarle el precio, ponerlo en oferta o archivarlo."
          tone={deadInventory.length > 0 ? "care" : "default"}
          action={
            deadInventory.length > 0 ? (
              /*
                El enlace se lleva los productos ya elegidos. Recorta a
                `OFFER_PRESELECTION_LIMIT` para que la dirección no se pase de
                largo, y cuando recorta lo dice: `getDeadInventory` ordena por
                plata inmovilizada, así que los que entran son los que más
                pesan, no los que llevan más tiempo quietos.
              */
              <Link
                href={buildOfferPreselectionHref(
                  storeId,
                  deadInventory.map((product: any) => product.id),
                )}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {deadInventory.length > OFFER_PRESELECTION_LIMIT
                  ? `Crear oferta con los ${OFFER_PRESELECTION_LIMIT} de más plata quieta`
                  : deadInventory.length === 1
                    ? "Crear oferta con este producto"
                    : `Crear oferta con los ${deadInventory.length}`}
              </Link>
            ) : undefined
          }
        >
          {deadInventory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguno lleva 60 días sin venderse. Todo está en movimiento.
            </p>
          ) : (
            <ul className="flex flex-col">
              {deadInventory.slice(0, 5).map((product: any) => (
                <li key={product.id}>
                  <Link
                    href={`/${storeId}/productos/${product.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-primary underline-offset-2 hover:underline">
                        {product.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {product.stock} unidades quietas
                      </span>
                    </span>
                    <TintBadge
                      tone="pink"
                      label={
                        product.daysSinceLastSale !== null
                          ? `${product.daysSinceLastSale} días quieto`
                          : "nunca vendido"
                      }
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
