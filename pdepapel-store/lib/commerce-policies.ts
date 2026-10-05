import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/**
 * Datos de envío y devoluciones para el marcado de producto. Cada valor sale
 * de una página publicada; si la página cambia, este archivo cambia con ella
 * (`tests/unit/lib/commerce-policies.test.ts` compara ambos).
 *
 * - Devoluciones (`app/(routes)/politicas/devoluciones/page.tsx`): «cinco (5)
 *   días calendario a partir de la fecha de compra»; el producto sin usar y en
 *   su empaque; si el cambio es por decisión del cliente, el envío corre por
 *   su cuenta.
 * - Envíos (`app/(routes)/politicas/envios/page.tsx`): el costo «lo calcula la
 *   transportadora según tu ciudad»; envío gratis cuando los productos
 *   alcanzan `Store.freeShippingThreshold`. No hay una tarifa fija publicada,
 *   así que solo se declara la tarifa cero por encima del umbral.
 */
export const RETURN_WINDOW_DAYS = 5;
export const SHIPPING_COUNTRY = "CO";

export function buildMerchantReturnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: SHIPPING_COUNTRY,
    returnPolicyCountry: SHIPPING_COUNTRY,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    merchantReturnLink: `${BASE_URL}${STOREFRONT_ROUTES.returnsPolicy}`,
  };
}

/**
 * Envío gratis a todo el país cuando el precio del producto ya alcanza el
 * umbral. Por debajo no hay tarifa publicada que declarar: devuelve null.
 */
export function buildFreeShippingDetails(
  price: number,
  freeShippingThreshold: number | null | undefined,
) {
  if (!freeShippingThreshold || !(price >= freeShippingThreshold)) return null;
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "COP" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: SHIPPING_COUNTRY },
  };
}
