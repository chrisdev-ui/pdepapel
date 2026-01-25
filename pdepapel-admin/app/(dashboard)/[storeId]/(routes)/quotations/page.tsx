import type { Metadata } from "next";
import { QuotationClient } from "./components/client";
import { QuotationColumn } from "./components/columns";
import { getQuotations } from "./server/get-quotations";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Cotizaciones | PdePapel Admin",
  description: "Gestión de plantillas y cotizaciones",
};

export default async function QuotationsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const quotations = await getQuotations(params.storeId);

  const formattedQuotations: QuotationColumn[] = quotations.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    isTemplate: item.isTemplate,
    isActive: item.isActive,
    itemCount: item.items.length,
    createdAt: item.createdAt,
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <QuotationClient data={formattedQuotations} />
      </div>
    </div>
  );
}
