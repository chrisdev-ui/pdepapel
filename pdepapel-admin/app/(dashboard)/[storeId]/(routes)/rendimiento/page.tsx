import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import { resolveBusinessGrowthPeriod } from "@/lib/business-growth-period";
import { requireStoreOwner } from "@/lib/store-access";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { BiDashboard } from "../inteligencia-negocio/components/bi-dashboard";
import { BusinessGrowthClient } from "../negocio/components/client";
import { BrandedLoader } from "@/components/ui/branded-loader";
import { Suspense } from "react";
import { ShippingAnalytics } from "./components/shipping-analytics";

export const revalidate = 0;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Rendimiento | PdePapel Admin",
  description: "Ventas, utilidad, gastos y productos que mejor rinden",
};

const TABS = [
  { id: "resumen", label: "Resumen y caja" },
  { id: "detalle", label: "Productos y riesgos" },
  { id: "envios", label: "Envíos" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface RendimientoPageProps {
  params: { storeId: string };
  searchParams: {
    tab?: string;
    month?: string | string[];
    year?: string | string[];
  };
}

/**
 * Solo la dueña: aquí va el dinero de la casa —ventas netas, utilidad,
 * margen por producto y el retiro personal sugerido—. No hay versión
 * depurada para una cuenta de solo lectura; si algún día la agencia
 * necesita cifras, se le hace una vista aparte con unidades y campañas.
 */
export default async function RendimientoPage({
  params,
  searchParams,
}: RendimientoPageProps) {
  await requireStoreOwner(params.storeId);
  const tab: Tab =
    searchParams.tab === "detalle"
      ? "detalle"
      : searchParams.tab === "envios"
        ? "envios"
        : "resumen";
  const period = resolveBusinessGrowthPeriod(searchParams);
  const query = new URLSearchParams();
  if (typeof searchParams.month === "string")
    query.set("month", searchParams.month);
  if (typeof searchParams.year === "string")
    query.set("year", searchParams.year);
  const hrefFor = (id: Tab) => {
    const q = new URLSearchParams(query);
    if (id !== "resumen") q.set("tab", id);
    const suffix = q.toString();
    return `/${params.storeId}/rendimiento${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          Rendimiento
        </h1>
        <p className="text-sm text-muted-foreground">
          Cuánto vendes, cuánto te cuesta y cuánto te queda, por mes. Une
          Negocio y crecimiento con el rendimiento detallado. Este panel decide;
          no mueve dinero.
        </p>
      </div>
      <nav
        role="tablist"
        aria-label="Vistas de rendimiento"
        className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border bg-white p-1"
      >
        {TABS.map((item) => (
          <Link
            key={item.id}
            role="tab"
            aria-selected={item.id === tab}
            href={hrefFor(item.id)}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
              item.id === tab
                ? "bg-primary text-primary-foreground"
                : "text-primary hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "resumen" ? (
        <Suspense
          key={`${period.year}-${period.month}`}
          fallback={<BrandedLoader />}
        >
          <ResumenYCaja
            storeId={params.storeId}
            referenceDate={period.referenceDate}
          />
        </Suspense>
      ) : tab === "envios" ? (
        <ShippingAnalytics storeId={params.storeId} />
      ) : (
        <BiDashboard
          params={params}
          searchParams={{
            month:
              typeof searchParams.month === "string"
                ? searchParams.month
                : undefined,
            year:
              typeof searchParams.year === "string"
                ? searchParams.year
                : undefined,
          }}
          embedded
        />
      )}
    </div>
  );
}

/**
 * El resumen del mes, tras su propia frontera.
 *
 * Antes se esperaba dentro del JSX de la página, así que cambiar de pestaña
 * bloqueaba la pantalla entera mientras se recalculaba el mes: las pestañas
 * son enlaces, y el servidor rehacía todo antes de pintar nada. Con la
 * frontera, la cabecera y las pestañas salen de inmediato y solo este bloque
 * espera.
 */
async function ResumenYCaja({
  storeId,
  referenceDate,
}: {
  storeId: string;
  referenceDate: Date;
}) {
  return (
    <BusinessGrowthClient
      storeId={storeId}
      initialData={await getBusinessGrowthOverview(storeId, referenceDate)}
      embedded
    />
  );
}
