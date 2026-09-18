import type { ImageLoaderProps } from "next/image";

const CLOUDINARY_HOSTNAME = "res.cloudinary.com";
const UPLOAD_SEGMENT = "/image/upload/";
const VERSION_SEGMENT = /^v\d+$/;
/**
 * Un segmento de transformación de Cloudinary: `c_limit,w_640`, `f_auto`,
 * `q_auto:eco`, `e_blur:300`… Sirve para limpiar URLs sin versión que ya
 * traían una transformación; si se dejaran, la nuestra se encadenaría encima
 * (`c_limit,w_640/c_limit,w_640/…`) y cada combinación sería otra copia.
 */
const TRANSFORMATION_PARAM =
  "(?:a|ac|af|ar|b|bo|br|c|co|cs|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|if|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_[^/,]*";
const TRANSFORMATION_SEGMENT = new RegExp(`^${TRANSFORMATION_PARAM}(?:,${TRANSFORMATION_PARAM})*$`);

/**
 * Anchos que se piden a Cloudinary. Cinco y solo cinco: cada ancho es una copia
 * derivada por foto (y una transformación cobrada la primera vez que se pide).
 * Cualquier otro ancho que `next/image` calcule se redondea al siguiente de
 * esta lista, así la lista de `deviceSizes`/`imageSizes` no puede ampliar el
 * catálogo de copias por accidente. La misma lista vive en
 * `pdepapel-admin/lib/cloudinary-image-loader.ts`; los dos tests la comprueban.
 * Medido en producción (2026-09-18): 128, 384, 640 y 1600 concentran el uso;
 * 1080 evita servir 1600 en tarjetas de escritorio. Se quitaron 64, 256, 750
 * y 1200. Reducir la lista no regenera nada: las copias de estos anchos ya
 * existen; ampliarla o cambiar la cadena sí.
 */
export const CLOUDINARY_DELIVERY_WIDTHS = [128, 384, 640, 1080, 1600] as const;

/** Ancho máximo que se pide a Cloudinary; por encima solo se crean copias idénticas. */
export const CLOUDINARY_MAX_WIDTH = 1600;

/** El menor ancho permitido que cubre el pedido; por encima del máximo, el máximo. */
export function snapCloudinaryWidth(width: number): number {
  const wanted = Math.max(1, Math.round(width));
  return CLOUDINARY_DELIVERY_WIDTHS.find((allowed) => allowed >= wanted) ?? CLOUDINARY_MAX_WIDTH;
}

/**
 * Única cadena de transformación de la tienda. Cada combinación distinta de
 * parámetros genera (y almacena para siempre) una copia derivada por foto y
 * por ancho, y cada copia nueva cuenta como transformación en el plan. Por eso
 * la calidad numérica de `next/image` se ignora a propósito y esta cadena no
 * se cambia a la ligera: modificarla regenera todo el catálogo.
 * Ver docs/imagenes-cloudinary.md.
 */
/**
 * Formato: sigue siendo `f_auto` a propósito. Fijarlo (`f_webp`) cambiaría la
 * cadena y regeneraría las ~4 copias por foto de todo el catálogo (unas 15 000
 * transformaciones ≈ 15 créditos de una vez); se decide al inicio de un ciclo
 * de facturación, nunca a mitad de uno excedido.
 */
const DELIVERY_TRANSFORMATION = "f_auto,q_auto,c_limit";

export function isCloudinaryUrl(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return url.hostname === CLOUDINARY_HOSTNAME && url.pathname.includes(UPLOAD_SEGMENT);
}

/**
 * Devuelve la URL de entrega de Cloudinary para un ancho dado: formato y
 * calidad automáticos, sin ampliar la foto y sin superar `CLOUDINARY_MAX_WIDTH`.
 * Descarta transformaciones y parámetros previos de la URL para que la misma
 * foto y el mismo ancho apunten siempre a la misma copia derivada. Cualquier
 * otra URL se devuelve tal cual.
 */
export function getCloudinaryImageUrl(src: string, width: number): string {
  if (!isCloudinaryUrl(src)) return src;

  const url = new URL(src);
  const uploadIndex = url.pathname.indexOf(UPLOAD_SEGMENT);
  const cloudPath = url.pathname.slice(0, uploadIndex);
  const segments = url.pathname
    .slice(uploadIndex + UPLOAD_SEGMENT.length)
    .split("/")
    .filter(Boolean);
  const versionIndex = segments.findIndex((segment) => VERSION_SEGMENT.test(segment));
  // Con versión, todo lo anterior a ella son transformaciones; sin versión,
  // se descartan los segmentos iniciales que parezcan transformaciones.
  let assetSegments = versionIndex === -1 ? segments : segments.slice(versionIndex);
  if (versionIndex === -1) {
    while (assetSegments.length > 1 && TRANSFORMATION_SEGMENT.test(assetSegments[0])) {
      assetSegments = assetSegments.slice(1);
    }
  }
  const assetPath = assetSegments.join("/");
  const boundedWidth = snapCloudinaryWidth(width);

  url.pathname = `${cloudPath}${UPLOAD_SEGMENT}${DELIVERY_TRANSFORMATION},w_${boundedWidth}/${assetPath}`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

/** Loader de `next/image` para las fotos alojadas en Cloudinary. */
export function cloudinaryLoader({ src, width }: ImageLoaderProps): string {
  return getCloudinaryImageUrl(src, width);
}
