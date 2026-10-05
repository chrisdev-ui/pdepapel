import type { Product as ProductSchema, WithContext } from "schema-dts";

import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/**
 * Foto de la tarjeta de regalo para el marcado. Es una imagen generada con IA
 * (2026-10-05): el archivo lleva en su XMP el `DigitalSourceType`
 * `trainedAlgorithmicMedia` de IPTC, que Google exige conservar en las
 * imágenes generadas. Se sirve tal cual desde `public/`, sin pasar por un
 * optimizador que borre metadatos; si se vuelve a exportar, hay que volver a
 * escribir esa etiqueta (`tests/unit/lib/gift-card-schema.test.ts` lo comprueba).
 */
export const GIFT_CARD_IMAGE_PATH = "/images/tarjeta-regalo-1200x1200.webp";

export function buildGiftCardJsonLd(denominations: number[], description: string): WithContext<ProductSchema> {
  const url = `${BASE_URL}${STOREFRONT_ROUTES.giftCard}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Tarjeta de regalo P de Papel",
    description,
    url,
    image: [`${BASE_URL}${GIFT_CARD_IMAGE_PATH}`],
    brand: { "@type": "Brand", name: "P de Papel" },
    offers: denominations.map((amount) => ({
      "@type": "Offer",
      price: amount,
      priceCurrency: "COP",
      availability: "https://schema.org/InStock",
      url,
    })),
  };
}
