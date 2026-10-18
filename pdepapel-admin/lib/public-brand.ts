import type { Prisma } from "@prisma/client";

import { isBrandPublic, type BrandLogoPermissionValue } from "@/lib/brand-rules";

/** Lo que sale de una marca por las rutas públicas del catálogo. */
export const PUBLIC_BRAND_SELECT = {
  name: true,
  slug: true,
  logoUrl: true,
  logoHasBackground: true,
  logoPermission: true,
  color: true,
  isVisible: true,
  isArchived: true,
  parent: { select: { name: true, slug: true, isVisible: true, isArchived: true } },
} satisfies Prisma.BrandSelect;

export interface PublicBrand {
  name: string;
  slug: string;
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: BrandLogoPermissionValue;
  color: string | null;
  /** Visible y no archivada: la tienda muestra enlaces, logos y filtros solo con esto en true. */
  isPublic: boolean;
  /** Si es una línea («Flower Power»), su marca madre («Primavera»). Una madre archivada no sale. */
  parent: { name: string; slug: string; isPublic: boolean } | null;
}

/** Marca archivada: no sale (ni el nombre). Oculta: sale con `isPublic: false`, solo para los datos. */
export function toPublicBrand(
  brand: Prisma.BrandGetPayload<{ select: typeof PUBLIC_BRAND_SELECT }> | null | undefined,
): PublicBrand | null {
  if (!brand || brand.isArchived) return null;
  return {
    name: brand.name,
    slug: brand.slug,
    logoUrl: brand.logoUrl,
    logoHasBackground: brand.logoHasBackground,
    logoPermission: brand.logoPermission,
    color: brand.color,
    isPublic: isBrandPublic(brand),
    parent:
      brand.parent && !brand.parent.isArchived
        ? { name: brand.parent.name, slug: brand.parent.slug, isPublic: isBrandPublic(brand.parent) }
        : null,
  };
}

/** Cambia `brandRef` (la fila) por `brand` (la forma pública) en un producto o grupo ya leído. */
export function withPublicBrand(out: Record<string, unknown>) {
  if ("brandRef" in out) {
    out.brand = toPublicBrand(out.brandRef as never);
    delete out.brandRef;
  }
  if (out.productGroup && typeof out.productGroup === "object") {
    const group = { ...(out.productGroup as Record<string, unknown>) };
    withPublicBrand(group);
    out.productGroup = group;
  }
  return out;
}
