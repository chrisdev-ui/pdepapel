import type { Metadata } from "next";

import TaxReportsClient from "./components/client";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reportes tributarios | P de Papel Admin",
  description: "Exporta las ventas y compras para declaraciones tributarias",
};

export default function TaxReportsPage() {
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <TaxReportsClient />
      </div>
    </div>
  );
}
