"use client";

import Image, { type ImageProps } from "next/image";

import { cloudinaryLoader } from "@/lib/cloudinary-loader";

/** `next/image` servido por Cloudinary con el ancho y formato exactos. */
export function CloudinaryImage({ alt, ...props }: Omit<ImageProps, "loader">) {
  return <Image alt={alt} {...props} loader={cloudinaryLoader} />;
}
