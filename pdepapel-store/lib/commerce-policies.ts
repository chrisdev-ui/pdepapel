import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/**
 * Datos de envío y devoluciones para el marcado de producto. Cada valor sale
 * de una página publicada; si la página cambia, este archivo cambia con ella
 * (`tests/unit/lib/commerce-policies.test.ts` compara ambos).
 *
 * - Devoluciones (`app/(routes)/politicas/devoluciones/page.tsx`): «cinco (5)
 *   días hábiles contados desde la entrega» (2026-10-05; es el mínimo del
 *   retracto en ventas a distancia, Ley 1480 de 2011, art. 47); el producto
 *   sin usar y en su empaque; si el cambio es por decisión del cliente, el
 *   envío corre por su cuenta; si es por un error nuestro o un defecto, lo
 *   asumimos nosotros. Google define `merchantReturnDays` en días desde la
 *   entrega, sin distinguir hábiles: se declaran 7 (decisión del 2026-10-05),
 *   una semana normal. Cerca de un festivo, cinco días hábiles pueden ser
 *   hasta 11 días calendario; el texto de la página es el que manda.
 * - Envíos (`app/(routes)/politicas/envios/page.tsx`): el costo «lo calcula la
 *   transportadora según tu ciudad»; envío gratis cuando los productos
 *   alcanzan `Store.freeShippingThreshold`. No hay una tarifa fija publicada,
 *   así que solo se declara la tarifa cero por encima del umbral.
 */
/** Días HÁBILES del texto de la política (lo que se le promete a la clienta). */
export const RETURN_WINDOW_DAYS = 5;
/** Días calendario que se declaran a Google en `merchantReturnDays`. */
export const MERCHANT_RETURN_DAYS = 7;
export const SHIPPING_COUNTRY = "CO";

/**
 * Preparación (`app/(routes)/politicas/envios/page.tsx`): sale el mismo día si
 * el pago se confirma antes de las 12:00 (hora de Colombia), de lunes a
 * viernes; si no, el siguiente día hábil. En el marcado de producto Google
 * solo documenta `handlingTime` y `transitTime` dentro de `deliveryTime`; la
 * hora de corte y los días hábiles existen solo en la política de envío de la
 * organización (`ServicePeriod`), así que aquí van 0–1 días. El tránsito
 * depende de la transportadora y no se declara.
 */
export const HANDLING_DAYS = { min: 0, max: 1 } as const;

export function buildMerchantReturnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: SHIPPING_COUNTRY,
    returnPolicyCountry: SHIPPING_COUNTRY,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: MERCHANT_RETURN_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    // Por decisión de la clienta, ella paga y gestiona el envío de vuelta;
    // por un error nuestro o un defecto, la devolución no le cuesta nada.
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    customerRemorseReturnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    itemDefectReturnFees: "https://schema.org/FreeReturn",
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
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: HANDLING_DAYS.min,
        maxValue: HANDLING_DAYS.max,
        unitCode: "DAY",
      },
    },
  };
}
