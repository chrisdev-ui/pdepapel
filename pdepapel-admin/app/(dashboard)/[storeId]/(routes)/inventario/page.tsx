import { hasStoreLowStockThreshold } from "@/lib/product-readiness";
import { parseInventoryListQuery } from "@/lib/inventory-list-query";
import type { Metadata } from "next";
import { InventoryClient } from "./components/inventory-client";
import { getInventoryPage } from "./server/get-inventory";

export const revalidate = 0;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Inventario | PdePapel Admin",
  description: "Stock, valorización y reposición.",
};

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { store, threshold, ...list } = await getInventoryPage(params.storeId, parseInventoryListQuery(searchParams));
  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <InventoryClient list={list} threshold={threshold} thresholdFromSettings={hasStoreLowStockThreshold(store)} />
    </div>
  );
}
