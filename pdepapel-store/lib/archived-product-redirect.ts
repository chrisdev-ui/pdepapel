import type { ArchivedProductRedirect } from "@/actions/get-product";
import { categoryPath, productPath, STOREFRONT_ROUTES, typePath } from "@/lib/routes";

/**
 * El destino lleva este fragmento: no se envía al servidor ni lo rastrea
 * Google (así no crea URL nuevas ni choca con `Disallow: /categoria/*?`), y en
 * el navegador muestra el aviso «Ese producto ya no está disponible».
 */
export const UNAVAILABLE_PRODUCT_HASH = "producto-no-disponible";

export function archivedProductRedirectPath(redirect: ArchivedProductRedirect) {
  const path =
    redirect.kind === "product"
      ? productPath(redirect.slug)
      : redirect.kind === "category"
        ? categoryPath(redirect.slug)
        : redirect.kind === "type"
          ? typePath({ id: redirect.id })
          : STOREFRONT_ROUTES.shop;
  return `${path}#${UNAVAILABLE_PRODUCT_HASH}`;
}
