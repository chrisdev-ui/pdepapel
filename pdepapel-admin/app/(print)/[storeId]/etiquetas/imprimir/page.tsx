import type { Metadata } from "next";

import { PrintLabelsClient } from "./print-labels-client";

export const metadata: Metadata = {
  title: "Imprimir etiquetas | PdePapel Admin",
  robots: { index: false, follow: false },
};

export default function PrintLabelsPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: { modo?: string };
}) {
  return (
    <PrintLabelsClient
      storeId={params.storeId}
      mode={searchParams.modo === "calibracion" ? "calibracion" : "etiquetas"}
    />
  );
}
