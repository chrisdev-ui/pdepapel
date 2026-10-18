import { brandLogoUrl } from "@/lib/brand-display";
import { getCloudinaryImageUrl, snapCloudinaryWidth } from "@/lib/cloudinary-loader";
import { cn } from "@/lib/utils";
import type { BrandLogoPermission } from "@/types";

interface BrandLogoProps {
  brand: { name: string; logoUrl: string | null; logoPermission: BrandLogoPermission };
  /** Caja en px: los atributos y la copia de Cloudinary (≤ 64 px → w_128). */
  width: number;
  height: number;
  /** El tamaño fijo de la caja (`h-11 w-16`…): el preflight pone `height: auto` a toda imagen y sin él habría CLS. */
  sizeClassName: string;
  /** `""` cuando el nombre va al lado; si no, el nombre de la marca. */
  alt: string;
  className?: string;
}

/**
 * Logo de la marca o nada: quien lo usa pinta el nombre en su lugar. Nunca
 * `priority` ni precarga: un logo no puede ser el LCP de la página. Es un
 * `<img>` del servidor con una sola URL (el ancho permitido que cubre 2×):
 * `next/image` añadiría un componente de cliente y un `srcset` por logo en
 * el HTML de cada página, y la copia de Cloudinary sería la misma.
 */
export function BrandLogo({ brand, width, height, sizeClassName, alt, className }: BrandLogoProps) {
  const url = brandLogoUrl(brand);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getCloudinaryImageUrl(url, snapCloudinaryWidth(width * 2))}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className={cn("shrink-0 object-contain", sizeClassName, className)}
    />
  );
}
