"use client";

import { ProductCatalog, type CatalogProps } from "@/components/catalog/product-catalog";
import { Button } from "@/components/ui/button";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { format } from "date-fns";
import { FileDown } from "lucide-react";

/**
 * Se carga solo después de pedir el catálogo: @react-pdf/renderer pesa más que
 * toda la lista de Productos y antes viajaba en cada visita.
 */
export default function CatalogPdfLink({ catalogData }: { catalogData: CatalogProps }) {
  return (
    <PDFDownloadLink
      document={<ProductCatalog products={catalogData.products} store={catalogData.store} />}
      fileName={`Catálogo-${catalogData.store.name.toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`}
    >
      {({ loading }) => (
        <Button variant="secondary" disabled={loading}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          {loading ? "Preparando PDF…" : "Descargar catálogo"}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
