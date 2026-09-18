import type { ImageLoaderProps } from "next/image";

const CLOUDINARY_HOSTNAME = "res.cloudinary.com";
const UPLOAD_SEGMENT = "/image/upload/";
const VERSION_SEGMENT = /^v\d+$/;

/**
 * Anchos que se piden a Cloudinary. Cinco y solo cinco: cada ancho es una copia
 * derivada por foto (y una transformación cobrada la primera vez que se pide).
 * Cualquier otro ancho que `next/image` calcule se redondea al siguiente de
 * esta lista, así la lista de `deviceSizes`/`imageSizes` no puede ampliar el
 * catálogo de copias por accidente. La misma lista vive en
 * `pdepapel-store/lib/cloudinary-loader.ts`; los dos tests la comprueban.
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
 * Misma cadena de transformación que la tienda (`pdepapel-store/lib/cloudinary-loader.ts`)
 * para que el panel y el storefront compartan las copias derivadas. Cada
 * combinación distinta genera y almacena una copia nueva por foto y por ancho,
 * así que no se cambia sin leer docs/imagenes-cloudinary.md.
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
 * URL de entrega de Cloudinary para un ancho dado (formato y calidad
 * automáticos, sin ampliar). Descarta transformaciones y parámetros previos.
 * Las URL que no son de Cloudinary (placeholders locales, logos de
 * transportadoras, data URLs) se devuelven tal cual.
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
  const assetPath = (versionIndex === -1 ? segments : segments.slice(versionIndex)).join("/");
  const boundedWidth = snapCloudinaryWidth(width);

  url.pathname = `${cloudPath}${UPLOAD_SEGMENT}${DELIVERY_TRANSFORMATION},w_${boundedWidth}/${assetPath}`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

/**
 * Loader global de `next/image` del panel (`images.loaderFile` en next.config):
 * el panel no usa el optimizador de Vercel; Cloudinary entrega las fotos del
 * catálogo al ancho pedido y todo lo demás se sirve sin tocar.
 */
export default function cloudinaryImageLoader({ src, width }: ImageLoaderProps): string {
  return getCloudinaryImageUrl(src, width);
}
