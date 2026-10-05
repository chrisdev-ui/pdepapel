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
 * - Envíos: desde el 2026-10-05 la fuente es la política de envío de Merchant
 *   Center (docs/seo/2026-10-05-seo-maintenance.md §9.13.2), que manda sobre
 *   el marcado: tarifa estándar nacional de 13.000 COP, gratis desde
 *   `Store.freeShippingThreshold` (250.000; en Merchant Center, «más de
 *   249.999»), preparación 0–1 días hábiles y tránsito 2–5 días hábiles, de
 *   lunes a viernes, corte a las 12:00 (Bogotá). La 13.000 es el p75 de lo que
 *   cobró la transportadora en 12 meses. **Pendiente:** la página de envíos
 *   todavía dice que el costo «lo calcula la transportadora» y «2 a 4 días
 *   hábiles»; el texto nuevo espera la aprobación de Paula (ola 3, fase 2A).
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
 * organización (`ServicePeriod`), así que aquí van 0–1 días y la hora de
 * corte va en `buildOrganizationShippingService`.
 */
export const HANDLING_DAYS = { min: 0, max: 1 } as const;
/** Tránsito de la política de Merchant Center (2–5 días hábiles, lunes a viernes). */
export const TRANSIT_DAYS = { min: 2, max: 5 } as const;
/** Tarifa estándar nacional de Merchant Center por debajo del umbral de envío gratis. */
export const STANDARD_SHIPPING_RATE = 13000;
/** Hora de corte de Merchant Center: 12:00 en Bogotá (UTC−5, sin horario de verano). */
export const ORDER_CUTOFF_TIME = "12:00:00-05:00";
export const BUSINESS_DAYS = [
  "https://schema.org/Monday",
  "https://schema.org/Tuesday",
  "https://schema.org/Wednesday",
  "https://schema.org/Thursday",
  "https://schema.org/Friday",
] as const;

const days = (range: { min: number; max: number }) => ({
  "@type": "QuantitativeValue",
  minValue: range.min,
  maxValue: range.max,
  unitCode: "DAY",
});
const cop = (value: number) => ({ "@type": "MonetaryAmount", value, currency: "COP" });
const colombia = { "@type": "DefinedRegion", addressCountry: SHIPPING_COUNTRY };

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
 * Envío de UNA unidad del producto (`Offer.shippingDetails`): gratis si su
 * precio ya alcanza el umbral, si no la tarifa estándar. El marcado de
 * producto no puede expresar «gratis según el valor del pedido»; esa regla va
 * en la organización (`buildOrganizationShippingService`).
 */
export function buildShippingDetails(
  price: number,
  freeShippingThreshold: number | null | undefined,
) {
  const isFree = Boolean(freeShippingThreshold) && price >= Number(freeShippingThreshold);
  return {
    "@type": "OfferShippingDetails",
    shippingRate: cop(isFree ? 0 : STANDARD_SHIPPING_RATE),
    shippingDestination: colombia,
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: days(HANDLING_DAYS),
      transitTime: days(TRANSIT_DAYS),
    },
  };
}

/**
 * Política de envío de la organización (`Organization.hasShippingService`,
 * https://developers.google.com/search/docs/appearance/structured-data/shipping-policy):
 * tarifa estándar por debajo del umbral y cero desde el umbral, por valor del
 * pedido. En orden de prioridad para Google: Merchant Center, el marcado de
 * producto y por último este. Sin umbral, solo la tarifa estándar.
 */
export function buildOrganizationShippingService(freeShippingThreshold: number | null | undefined) {
  const threshold = freeShippingThreshold && freeShippingThreshold > 0 ? freeShippingThreshold : null;
  const transitTime = { "@type": "ServicePeriod", duration: days(TRANSIT_DAYS), businessDays: [...BUSINESS_DAYS] };
  const condition = (orderValue: Record<string, unknown> | null, rate: number) => ({
    "@type": "ShippingConditions",
    shippingDestination: colombia,
    ...(orderValue ? { orderValue: { "@type": "MonetaryAmount", currency: "COP", ...orderValue } } : {}),
    shippingRate: cop(rate),
    transitTime,
  });
  return {
    "@type": "ShippingService",
    name: "Envío estándar",
    fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
    handlingTime: {
      "@type": "ServicePeriod",
      duration: days(HANDLING_DAYS),
      cutoffTime: ORDER_CUTOFF_TIME,
      businessDays: [...BUSINESS_DAYS],
    },
    shippingConditions: threshold
      ? [condition({ minValue: 0, maxValue: threshold - 1 }, STANDARD_SHIPPING_RATE), condition({ minValue: threshold }, 0)]
      : [condition(null, STANDARD_SHIPPING_RATE)],
  };
}
