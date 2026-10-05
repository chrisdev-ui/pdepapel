"use client";

import { useEffect } from "react";

import { toast } from "@/hooks/use-toast";
import { UNAVAILABLE_PRODUCT_HASH } from "@/lib/archived-product-redirect";

/**
 * Quien llega desde un producto archivado (308 con `#producto-no-disponible`)
 * ve un aviso corto en la página de destino; luego se limpia el fragmento
 * para que recargar o compartir la URL no lo repita.
 */
export function UnavailableProductNotice() {
  useEffect(() => {
    if (window.location.hash !== `#${UNAVAILABLE_PRODUCT_HASH}`) return;
    toast({ description: "Ese producto ya no está disponible. Te mostramos lo más parecido que tenemos." });
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);

  return null;
}
