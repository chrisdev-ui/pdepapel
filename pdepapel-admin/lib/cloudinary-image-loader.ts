import type { ImageLoaderProps } from "next/image";

const CLOUDINARY_HOSTNAME = "res.cloudinary.com";
const UPLOAD_SEGMENT = "/image/upload/";
const VERSION_SEGMENT = /^v\d+$/;

/** Ancho máximo que se pide a Cloudinary; por encima solo se crean copias idénticas. */
export const CLOUDINARY_MAX_WIDTH = 1600;

/**
 * Misma cadena de transformación que la tienda (`pdepapel-store/lib/cloudinary-loader.ts`)
 * para que el panel y el storefront compartan las copias derivadas. Cada
 * combinación distinta genera y almacena una copia nueva por foto y por ancho,
 * así que no se cambia sin leer docs/imagenes-cloudinary.md.
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
  const boundedWidth = Math.max(1, Math.min(Math.round(width), CLOUDINARY_MAX_WIDTH));

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
