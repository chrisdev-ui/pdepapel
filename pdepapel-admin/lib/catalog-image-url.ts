// Sin dependencias de servidor: también lo usa el asistente de Mercado Libre en el navegador.
import { splitCloudinaryUrl } from "@/lib/cloudinary-image-loader";

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

const CLOUDINARY_UPLOAD_SEGMENT = "/image/upload/";

/**
 * Copia que se entrega a los rastreadores de catálogo (Google Merchant, Meta,
 * Mercado Libre): 1600 px como máximo y calidad automática, con el formato
 * fijado por la extensión porque esos servicios no aceptan WebP/AVIF. Antes
 * apuntaban al original completo, y esos rastreadores (sin Referer) eran una
 * parte grande del ancho de banda de Cloudinary. Una sola combinación: cada
 * variante distinta es otra copia derivada por foto. Las comas van como
 * `%2C` (Cloudinary las acepta igual) porque `additional_image_link` separa
 * varias URL con coma y una coma literal partiría la URL.
 */
export const GOOGLE_MERCHANT_IMAGE_TRANSFORMATION = "c_limit%2Cw_1600%2Cq_auto";

export function getUrlExtension(pathname: string) {
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
