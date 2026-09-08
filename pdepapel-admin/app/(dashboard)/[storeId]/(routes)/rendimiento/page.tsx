import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import { resolveBusinessGrowthPeriod } from "@/lib/business-growth-period";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
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
  searchParams: { tab?: string; month?: string | string[]; year?: string | string[] };
}

export default async function RendimientoPage({ params, searchParams }: RendimientoPageProps) {
  const tab: Tab = searchParams.tab === "detalle" ? "detalle" : searchParams.tab === "envios" ? "envios" : "resumen";
  const period = resolveBusinessGrowthPeriod(searchParams);
  const query = new URLSearchParams();
  if (typeof searchParams.month === "string") query.set("month", searchParams.month);
  if (typeof searchParams.year === "string") query.set("year", searchParams.year);
  const hrefFor = (id: Tab) => {
    const q = new URLSearchParams(query);
    if (id !== "resumen") q.set("tab", id);
    const suffix = q.toString();
    return `/${params.storeId}/rendimiento${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Rendimiento</h1>
        <p className="text-sm text-muted-foreground">
          Cuánto vendes, cuánto te cuesta y cuánto te queda, por mes. Une Negocio y crecimiento con el rendimiento detallado. Este panel decide; no mueve dinero.
        </p>
      </div>
      <nav role="tablist" aria-label="Vistas de rendimiento" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
        {TABS.map((item) => (
          <Link
            key={item.id}
            role="tab"
            aria-selected={item.id === tab}
            href={hrefFor(item.id)}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
              item.id === tab ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "resumen" ? (
        <BusinessGrowthClient
          key={`${period.year}-${period.month}`}
          storeId={params.storeId}
          initialData={await getBusinessGrowthOverview(params.storeId, period.referenceDate)}
          embedded
        />
      ) : tab === "envios" ? (
        <ShippingAnalytics storeId={params.storeId} />
      ) : (
        <BiDashboard params={params} searchParams={{ month: typeof searchParams.month === "string" ? searchParams.month : undefined, year: typeof searchParams.year === "string" ? searchParams.year : undefined }} embedded />
      )}
    </div>
  );
}
