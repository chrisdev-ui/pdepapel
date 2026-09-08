import type { Metadata } from "next";
import Link from "next/link";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { cn } from "@/lib/utils";

import { ReviewsPanel } from "../resenas/components/reviews-panel";
import { getReviews } from "../resenas/server/get-reviews";
import CustomerClient from "./components/client";
import { getCustomers, toCustomerRows } from "./server/get-customers";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Clientes | PdePapel Admin",
  description: "Clientes, segmentos, reactivación y reseñas",
};

const TABS = [
  { id: "clientes", label: "Clientes" },
  { id: "resenas", label: "Reseñas" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface CustomerPageProps {
  params: { storeId: string };
  searchParams: { tab?: string };
}

export default async function CustomerPage({ params, searchParams }: CustomerPageProps) {
  const tab: Tab = searchParams.tab === "resenas" ? "resenas" : "clientes";
  const hrefFor = (id: Tab) => `/${params.storeId}/clientes${id === "clientes" ? "" : `?tab=${id}`}`;
  const store = await prismadb.store.findUnique({ where: { id: params.storeId }, select: { name: true } });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Quién compra, quién repite y a quién vale la pena escribirle. Cada persona se arma con sus pedidos por teléfono.
        </p>
      </div>
      <nav role="tablist" aria-label="Secciones de clientes" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
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
      {tab === "clientes" ? (
        <CustomerClient
          data={toCustomerRows(await getCustomers(params.storeId))}
          storeName={store?.name ?? "P de Papel"}
          storeUrl={env.FRONTEND_STORE_URL}
        />
      ) : (
        <ReviewsPanel data={await getReviews(params.storeId)} />
      )}
    </div>
  );
}
