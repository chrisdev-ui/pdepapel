"use client";

import { Button } from "@/components/ui/button";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { StoreInvoicePDF, type InvoiceData } from "./store-invoice-pdf";

interface InvoiceDownloadButtonProps {
  data: InvoiceData;
  disabled?: boolean;
}

export const InvoiceDownloadButton = ({
  data,
  disabled,
}: InvoiceDownloadButtonProps) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className="flex items-center gap-2"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparando PDF...
      </Button>
    );
  }

  return (
    <PDFDownloadLink
      document={<StoreInvoicePDF data={data} />}
      fileName={`Orden_${data.orderNumber}.pdf`}
    >
      {({ loading: pdfLoading }) => {
        return (
          <Button
            type="button"
            variant="outline"
            disabled={pdfLoading || disabled}
            className="flex items-center gap-2"
          >
            {pdfLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Descargar Recibo
              </>
            )}
          </Button>
        );
      }}
    </PDFDownloadLink>
  );
};
