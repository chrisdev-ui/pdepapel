import {
  getCustomerFacingAttributeName,
  getCustomerFacingSizeName,
} from "@/lib/product-naming";
import { richTextToPlainText } from "@/lib/rich-text";

export {
  GOOGLE_MERCHANT_IMAGE_TRANSFORMATION,
  GOOGLE_MERCHANT_SUPPORTED_IMAGE_EXTENSIONS,
  toGoogleMerchantImageUrl,
} from "@/lib/catalog-image-url";
import { getUrlExtension, toGoogleMerchantImageUrl } from "@/lib/catalog-image-url";

export const GOOGLE_MERCHANT_STOREFRONT_URL = "https://papeleriapdepapel.com";

/** Merchant Center caps `description` at 5000 characters. */
export const GOOGLE_MERCHANT_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * Avisos de marca que cierran la descripción de los bloques de construcción
 * (antes «Lego»; scripts/rename-lego-to-bloques.mjs). En la ficha aclaran que
 * no son productos de LEGO; en Google y Meta solo pondrían la marca ajena en
 * el texto del anuncio, así que el feed los quita. Frases exactas: un texto
 * que solo se les parezca no se toca.
 */
export const GOOGLE_MERCHANT_STRIPPED_DISCLAIMERS = [
  "Son bloques de construcción estilo Lego. No son productos de LEGO ni están afiliados a LEGO Group.",
  "Es un tajalápiz estilo Lego. No es un producto de LEGO ni está afiliado a LEGO Group.",
  "La figura de bloques es estilo Lego. No es un producto de LEGO ni está afiliada a LEGO Group.",
] as const;

function stripDisclaimers(text: string) {
  let result = text;
  for (const sentence of GOOGLE_MERCHANT_STRIPPED_DISCLAIMERS) {
    result = result.split(sentence).join(" ");
  }
  return result === text ? text : result.replace(/\s+/g, " ").trim();
}

/**
 * Product descriptions are stored as sanitized Tiptap HTML; Merchant Center
 * renders tags literally, so the feed carries plain text and falls back to
 * the product name when there is no description (or when the description is
 * only a brand disclaimer).
 */
export function getGoogleMerchantDescription(
  description: string | null | undefined,
  fallback: string,
) {
  const text =
    stripDisclaimers(
      // Tags are replaced by spaces upstream; drop the space left before
      // punctuation ("<strong>A5</strong>," -> "A5,").
      richTextToPlainText(description).replace(/\s+([,.;:!?)\]])/g, "$1"),
    ) || fallback.trim();

  return text.length > GOOGLE_MERCHANT_DESCRIPTION_MAX_LENGTH
    ? text.slice(0, GOOGLE_MERCHANT_DESCRIPTION_MAX_LENGTH).trimEnd()
    : text;
}


/**
 * P de Papel is an online-only store: excluding the local destinations stops
 * Merchant Center from expecting a local inventory feed for every product
 * ("Faltan datos de inventario local").
 */
export const GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS = [
  "Local_inventory_ads",
  "Free_local_listings",
] as const;





/**
 * Solo un cambio de formato (webp → png) merece aviso en el informe; el
 * tamaño se aplica a todas las fotos y no es una «reescritura».
 */
export function isGoogleMerchantFormatRewrite(from: string, to: string) {
  const extensionOf = (value: string) => {
    try {
      return getUrlExtension(new URL(value).pathname);
    } catch {
      return "";
    }
  };
  return Boolean(to) && extensionOf(from) !== extensionOf(to);
}

export function getGoogleMerchantProductLink(
  product: { slug?: string | null; id: string },
  baseUrl = GOOGLE_MERCHANT_STOREFRONT_URL,
) {
  return `${baseUrl}/producto/${product.slug || product.id}`;
}

export function getGoogleMerchantSize(
  categoryName: string | null | undefined,
  size: { name?: string | null; value?: string | null } | null | undefined,
) {
  return getCustomerFacingSizeName({
    categoryName,
    sizeName: size?.name,
    sizeValue: size?.value,
  });
}

export function getGoogleMerchantColor(
  productName: string | null | undefined,
  color: { name?: string | null } | null | undefined,
) {
  return getCustomerFacingAttributeName({
    productName,
    attributeName: color?.name,
  });
}

export function getGoogleMerchantPattern(
  productName: string | null | undefined,
  design: { name?: string | null } | null | undefined,
) {
  return getCustomerFacingAttributeName({
    productName,
    attributeName: design?.name,
  });
}
