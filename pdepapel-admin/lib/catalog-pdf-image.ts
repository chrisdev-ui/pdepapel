import { splitCloudinaryUrl } from "@/lib/cloudinary-image-loader";

/**
 * Medidas de la tarjeta del catálogo PDF (`components/catalog/product-catalog.tsx`
 * las usa en sus estilos). De aquí sale la caja de la foto y, de ella, la
 * copia que se pide a Cloudinary: si la tarjeta cambia, cambia la copia y la
 * prueba que fija la transformación autorizada falla a propósito.
 */
export const CATALOG_PDF_LAYOUT = {
  /** A4 en puntos. */
  pageWidth: 595.28,
  pagePadding: 30,
  cardWidthPercent: 48,
  cardPadding: 10,
  cardBorder: 2,
  photoHeight: 200,
} as const;

/** Caja de la foto: 48 % de 535,28 pt menos relleno y borde a cada lado ≈ 233 × 200 pt. */
export const CATALOG_PDF_PHOTO_BOX = {
  width:
    ((CATALOG_PDF_LAYOUT.pageWidth - 2 * CATALOG_PDF_LAYOUT.pagePadding) * CATALOG_PDF_LAYOUT.cardWidthPercent) / 100 -
    2 * (CATALOG_PDF_LAYOUT.cardPadding + CATALOG_PDF_LAYOUT.cardBorder),
  height: CATALOG_PDF_LAYOUT.photoHeight,
};

/**
 * 400 px de ancho (≈124 ppp impresa) y el alto con la proporción de la caja:
 * 233 × 200 pt → 400 × 344 px. Con la misma proporción, `c_fill` recorta en
 * Cloudinary exactamente lo que `objectFit: cover` recortaba del original.
 */
export const CATALOG_PDF_IMAGE_WIDTH = 400;
export const CATALOG_PDF_IMAGE_HEIGHT = Math.ceil((CATALOG_PDF_IMAGE_WIDTH * CATALOG_PDF_PHOTO_BOX.height) / CATALOG_PDF_PHOTO_BOX.width);

/**
 * La foto de cada tarjeta. Antes se incrustaba el original completo
 * (≈1.400 × 1.700 px) y el PDF pesaba ≈215 MB. JPEG fijado por la extensión
 * porque react-pdf no lee WebP ni AVIF. Es una transformación propia del
 * catálogo, autorizada aparte de la de entrega (docs/imagenes-cloudinary.md):
 * una copia derivada por foto, una sola vez.
 */
export const CATALOG_PDF_IMAGE_TRANSFORMATION = `c_fill,w_${CATALOG_PDF_IMAGE_WIDTH},h_${CATALOG_PDF_IMAGE_HEIGHT},q_auto`;

export function catalogPdfImageUrl(url: string): string {
  const parts = splitCloudinaryUrl(url);
  if (!parts) return url;
  const { url: parsed, cloudPath } = parts;
  const dot = parts.assetPath.lastIndexOf(".");
  const lastSlash = parts.assetPath.lastIndexOf("/");
  const base = dot > lastSlash ? parts.assetPath.slice(0, dot) : parts.assetPath;
  parsed.pathname = `${cloudPath}/image/upload/${CATALOG_PDF_IMAGE_TRANSFORMATION}/${base}.jpg`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
