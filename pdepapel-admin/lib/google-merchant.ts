import {
  getCustomerFacingAttributeName,
  getCustomerFacingSizeName,
} from "@/lib/product-naming";
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

function getUrlExtension(pathname: string) {
  const lastSegment = pathname.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");

  return dotIndex > 0 ? lastSegment.slice(dotIndex + 1).toLowerCase() : "";
}

/**
 * Returns an `image_link` Google accepts. Cloudinary delivers whatever format
 * the URL extension asks for, so an unsupported (or missing) extension is
 * swapped for PNG, which keeps transparency. Non-Cloudinary URLs are returned
 * unchanged because their format cannot be renegotiated from the URL.
 */
export function toGoogleMerchantImageUrl(url: string | null | undefined) {
  if (!url) return "";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const extension = getUrlExtension(parsed.pathname);
  if (
    (GOOGLE_MERCHANT_SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(
      extension,
    )
  ) {
    return url;
  }

  const isCloudinary =
    parsed.hostname.endsWith("cloudinary.com") &&
    parsed.pathname.includes(CLOUDINARY_UPLOAD_SEGMENT);
  if (!isCloudinary) return url;

  parsed.pathname = extension
    ? parsed.pathname.slice(0, -(extension.length + 1)) + ".png"
    : `${parsed.pathname}.png`;

  return parsed.toString();
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
