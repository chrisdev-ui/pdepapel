import {
  getCustomerFacingAttributeName,
  getCustomerFacingSizeName,
} from "@/lib/product-naming";
import { splitCloudinaryUrl } from "@/lib/cloudinary-image-loader";
import { richTextToPlainText } from "@/lib/rich-text";

export const GOOGLE_MERCHANT_STOREFRONT_URL = "https://papeleriapdepapel.com";

/** Merchant Center caps `description` at 5000 characters. */
export const GOOGLE_MERCHANT_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * Product descriptions are stored as sanitized Tiptap HTML; Merchant Center
 * renders tags literally, so the feed carries plain text and falls back to
 * the product name when there is no description.
 */
export function getGoogleMerchantDescription(
  description: string | null | undefined,
  fallback: string,
) {
  const text =
    // Tags are replaced by spaces upstream; drop the space left before
    // punctuation ("<strong>A5</strong>," -> "A5,").
    richTextToPlainText(description).replace(/\s+([,.;:!?)\]])/g, "$1") ||
    fallback.trim();

  return text.length > GOOGLE_MERCHANT_DESCRIPTION_MAX_LENGTH
    ? text.slice(0, GOOGLE_MERCHANT_DESCRIPTION_MAX_LENGTH).trimEnd()
    : text;
}

/**
 * Image formats Google Merchant accepts for `image_link` /
 * `additional_image_link`. WebP and AVIF are not accepted and trigger
 * "Tipo de imagen no admitido".
 */
export const GOOGLE_MERCHANT_SUPPORTED_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tif",
  "tiff",
] as const;

/**
 * P de Papel is an online-only store: excluding the local destinations stops
 * Merchant Center from expecting a local inventory feed for every product
 * ("Faltan datos de inventario local").
 */
export const GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS = [
  "Local_inventory_ads",
  "Free_local_listings",
] as const;

const CLOUDINARY_UPLOAD_SEGMENT = "/image/upload/";

/**
 * Copia que se entrega a los rastreadores de catálogo (Google Merchant, Meta,
 * Mercado Libre): 1600 px como máximo y calidad automática, con el formato
 * fijado por la extensión porque esos servicios no aceptan WebP/AVIF. Antes
 * apuntaban al original completo, y esos rastreadores (sin Referer) eran una
 * parte grande del ancho de banda de Cloudinary. Una sola combinación: cada
 * variante distinta es otra copia derivada por foto.
 */
export const GOOGLE_MERCHANT_IMAGE_TRANSFORMATION = "c_limit,w_1600,q_auto";

function getUrlExtension(pathname: string) {
  const lastSegment = pathname.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");

  return dotIndex > 0 ? lastSegment.slice(dotIndex + 1).toLowerCase() : "";
}

/**
 * Returns an `image_link` Google accepts: the sized Cloudinary copy, with an
 * unsupported (or missing) extension swapped for PNG, which keeps
 * transparency. Non-Cloudinary URLs are returned unchanged because their
 * format and size cannot be renegotiated from the URL.
 */
export function toGoogleMerchantImageUrl(url: string | null | undefined) {
  if (!url) return "";

  const parts = splitCloudinaryUrl(url);
  if (!parts) return url;

  const { url: parsed, cloudPath } = parts;
  let assetPath = parts.assetPath;
  const extension = getUrlExtension(assetPath);
  if (
    !(GOOGLE_MERCHANT_SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(
      extension,
    )
  ) {
    assetPath = extension
      ? assetPath.slice(0, -(extension.length + 1)) + ".png"
      : `${assetPath}.png`;
  }

  parsed.pathname = `${cloudPath}${CLOUDINARY_UPLOAD_SEGMENT}${GOOGLE_MERCHANT_IMAGE_TRANSFORMATION}/${assetPath}`;
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString();
}

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
