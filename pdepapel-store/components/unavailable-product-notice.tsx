"use client";

import { useEffect } from "react";

import { toast } from "@/hooks/use-toast";
import { UNAVAILABLE_PRODUCT_HASH } from "@/lib/archived-product-redirect";

/**
 * Quien llega desde un producto archivado (308 con `#producto-no-disponible`)
 * ve un aviso corto en la página de destino; luego se limpia el fragmento
 * para que recargar o compartir la URL no lo repita.
 *
 * El `toast()` va en un `setTimeout`: el `Toaster` del layout raíz se suscribe
 * en su propio efecto, que corre después de este, y un aviso emitido antes se
 * pierde sin error.
 */
export function UnavailableProductNotice() {
  useEffect(() => {
    if (window.location.hash !== `#${UNAVAILABLE_PRODUCT_HASH}`) return;
    const timer = window.setTimeout(() => {
      toast({ description: "Ese producto ya no está disponible. Te mostramos lo más parecido que tenemos." });
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
