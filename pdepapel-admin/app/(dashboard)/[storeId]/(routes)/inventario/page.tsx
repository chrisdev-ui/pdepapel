import { hasStoreLowStockThreshold, resolveLowStockThreshold } from "@/lib/product-readiness";
import prismadb from "@/lib/prismadb";
import type { Metadata } from "next";
import { InventoryClient } from "./components/inventory-client";
import { getInventory } from "./server/get-inventory";

export const revalidate = 0;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Inventario | PdePapel Admin",
  description: "Stock, valorización y reposición.",
};

export default async function InventoryPage({ params, searchParams }: { params: { storeId: string }; searchParams?: { vista?: string; agrupar?: string } }) {
  const [rows, store] = await Promise.all([
    getInventory(params.storeId),
    prismadb.store.findUnique({ where: { id: params.storeId }, select: { lowStockThreshold: true } }),
  ]);
  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <InventoryClient
        data={rows}
        threshold={resolveLowStockThreshold(store)}
        thresholdFromSettings={hasStoreLowStockThreshold(store)}
        initialView={searchParams?.vista ?? null}
        initialGrouped={searchParams?.agrupar === "proveedor"}
      />
    </div>
  );
}
