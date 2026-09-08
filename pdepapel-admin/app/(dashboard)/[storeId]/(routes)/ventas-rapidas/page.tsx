import type { Metadata } from "next";
import Link from "next/link";

import { getPointOfSaleDaySummary } from "@/lib/point-of-sale-day";
import { cn } from "@/lib/utils";

import { DayCloseCard } from "./components/day-close-card";
import { LabelsPanel } from "./components/labels-panel";
import { SellPanel } from "./components/sell-panel";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Punto de venta | PdePapel Admin",
  description: "Ventas presenciales, etiquetas y cierre del día",
};

const TABS = [
  { id: "vender", label: "Vender" },
  { id: "etiquetas", label: "Etiquetas" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface PointOfSalePageProps {
  params: { storeId: string };
  searchParams: { tab?: string };
}

export default async function PointOfSalePage({ params, searchParams }: PointOfSalePageProps) {
  const tab: Tab = searchParams.tab === "etiquetas" ? "etiquetas" : "vender";
  const hrefFor = (id: Tab) =>
    `/${params.storeId}/ventas-rapidas${id === "vender" ? "" : `?tab=${id}`}`;
  const summary = tab === "vender" ? await getPointOfSaleDaySummary(params.storeId) : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Punto de venta</h1>
        <p className="text-sm text-muted-foreground">
          Registra ventas presenciales fuera de feria y descuenta el inventario al confirmar el pago. Dentro de una feria vende desde Ferias.
        </p>
      </div>
      <nav
        role="tablist"
        aria-label="Vistas del punto de venta"
        className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1"
      >
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
      {tab === "vender" && summary ? (
        <SellPanel dayClose={<DayCloseCard storeId={params.storeId} summary={summary} />} />
      ) : (
        <LabelsPanel />
      )}
    </div>
  );
}
