"use client";

import Image, { type ImageProps } from "next/image";

import { cloudinaryLoader } from "@/lib/cloudinary-loader";

/**
 * Única forma de mostrar una foto de Cloudinary en la tienda: `next/image`
 * servido directamente por Cloudinary con el ancho y el formato exactos, sin
 * pasar por el optimizador de Vercel. Para miniaturas de tamaño fijo usa
 * `width`/`height` (dos candidatos en el `srcset`); reserva `fill` + `sizes`
 * para cajas fluidas. Las URL que no son de Cloudinary se sirven tal cual.
 */
export function CloudinaryImage({ alt, ...props }: Omit<ImageProps, "loader">) {
  return <Image alt={alt} {...props} loader={cloudinaryLoader} />;
}
