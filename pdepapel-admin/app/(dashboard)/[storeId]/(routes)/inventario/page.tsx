import type { Metadata } from "next";
import { InventoryClient } from "./components/inventory-client";
import { getInventory } from "./server/get-inventory";

export const revalidate = 0;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Inventario | PdePapel Admin",
  description: "Stock, valorización y reposición.",
};

export default async function InventoryPage({ params }: { params: { storeId: string } }) {
  const rows = await getInventory(params.storeId);
  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <InventoryClient data={rows} />
    </div>
  );
}
