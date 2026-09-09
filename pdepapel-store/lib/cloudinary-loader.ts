import type { ImageLoaderProps } from "next/image";

const UPLOAD_SEGMENT = "/image/upload/";

export function isCloudinaryUrl(src: string): boolean {
  return src.startsWith("https://res.cloudinary.com/") && src.includes(UPLOAD_SEGMENT);
}

// Pide a Cloudinary el tamaño exacto en el formato que el navegador soporte, en
// lugar de pasar por el optimizador de Next: menos saltos y caché en su CDN.
export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!isCloudinaryUrl(src)) return src;
  const [prefix, rest] = src.split(UPLOAD_SEGMENT);
  const transforms = `f_auto,q_auto${quality ? `:${quality}` : ""},c_limit,w_${width}`;
  return `${prefix}${UPLOAD_SEGMENT}${transforms}/${rest}`;
}
