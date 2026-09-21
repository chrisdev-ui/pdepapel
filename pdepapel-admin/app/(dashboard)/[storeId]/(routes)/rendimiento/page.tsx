import { BrandedLoader } from "@/components/ui/branded-loader";
import { TabNav } from "@/components/ui/tab-nav";
import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import {
  resolveBusinessGrowthPeriod,
  type BusinessGrowthPeriodSelection,
} from "@/lib/business-growth-period";
import {
  isBusinessGrowthSection,
  type BusinessGrowthSection,
} from "@/lib/business-growth-sections";
import { requireStoreOwner } from "@/lib/store-access";
import type { Metadata } from "next";
import { Suspense } from "react";

import { BiDashboard } from "../inteligencia-negocio/components/bi-dashboard";
import { BusinessGrowthClient } from "../negocio/components/client";
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
    sub?: string;
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
  const section: BusinessGrowthSection = isBusinessGrowthSection(
    searchParams.sub,
  )
    ? searchParams.sub
    : "resumen";

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

      <TabNav
        items={TABS.map((item) => ({ ...item, href: hrefFor(item.id) }))}
        activeId={tab}
        label="Vistas de rendimiento"
      />

      {/*
        Cada vista tras su propia frontera.
        Antes solo la primera la tenía: entrar en Envíos dejaba la pantalla
        entera —cabecera y barra incluidas— esperando a una consulta que traía
        todos los envíos de la historia. La clave lleva el período para que
        cambiar de mes vuelva a mostrar el cargador en vez de congelar las
        cifras del mes anterior.
      */}
      <Suspense
        key={`${tab}-${period.year}-${period.month}`}
        fallback={<BrandedLoader />}
      >
        {tab === "resumen" ? (
          <ResumenYCaja
            storeId={params.storeId}
            period={period}
            section={section}
          />
        ) : tab === "envios" ? (
          <ShippingAnalytics storeId={params.storeId} period={period} />
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
          />
        )}
      </Suspense>
    </div>
  );
}

async function ResumenYCaja({
  storeId,
  period,
  section,
}: {
  storeId: string;
  period: BusinessGrowthPeriodSelection;
  section: BusinessGrowthSection;
}) {
  return (
    <BusinessGrowthClient
      storeId={storeId}
      initialData={await getBusinessGrowthOverview(
        storeId,
        period.referenceDate,
      )}
      section={section}
    />
  );
}
