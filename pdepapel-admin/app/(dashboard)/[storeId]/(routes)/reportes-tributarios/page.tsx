import { getTaxReadiness } from "@/lib/tax-readiness";
import { requireStoreOwner } from "@/lib/store-access";
import type { Metadata } from "next";

import TaxReportsClient from "./components/client";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reportes tributarios | P de Papel Admin",
  description: "Exporta las ventas y compras para declaraciones tributarias",
};

/**
 * Solo la dueña: ventas y compras del período para la declaración. El menú ya
 * la escondía, pero esconder una entrada no cierra una URL.
 */
export default async function TaxReportsPage({ params }: { params: { storeId: string } }) {
  await requireStoreOwner(params.storeId);
  const readiness = await getTaxReadiness(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <TaxReportsClient readiness={readiness} />
      </div>
    </div>
  );
}
