import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { getCoupons } from "../cupones/server/get-coupons";
import { getOffers } from "../ofertas/server/get-offers";
import { PromotionsPanel } from "./components/promotions-panel";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Promociones | PdePapel Admin",
  description: "Ofertas por periodo y cupones de descuento",
};

const TABS = [
  { id: "ofertas", label: "Ofertas" },
  { id: "cupones", label: "Cupones" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface PromotionsPageProps {
  params: { storeId: string };
  searchParams: { tab?: string };
}

export default async function PromotionsPage({ params, searchParams }: PromotionsPageProps) {
  const tab: Tab = searchParams.tab === "cupones" ? "cupones" : "ofertas";
  const hrefFor = (id: Tab) => `/${params.storeId}/promociones${id === "ofertas" ? "" : `?tab=${id}`}`;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Promociones</h1>
        <p className="text-sm text-muted-foreground">
          Ofertas que rebajan precios por un periodo y cupones que la persona escribe al pagar. Las vigencias se recalculan solas cada día.
        </p>
      </div>
      <nav role="tablist" aria-label="Tipos de promoción" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
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
      {tab === "ofertas" ? (
        <PromotionsPanel kind="ofertas" data={await getOffers(params.storeId)} />
      ) : (
        <PromotionsPanel kind="cupones" data={await getCoupons(params.storeId)} />
      )}
    </div>
  );
}
