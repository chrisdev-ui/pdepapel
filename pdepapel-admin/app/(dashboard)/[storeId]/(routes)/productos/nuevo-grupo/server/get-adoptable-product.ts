import "server-only";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { GALLERY_ORDER } from "@/lib/variant-gallery";

import type { ImportedProduct } from "../../components/product-group-form";

/**
 * El producto suelto que «Convertir en variantes» lleva al editor de grupo, con
 * la misma forma que «Traer existentes». `null` si no es de la tienda, ya está
 * en un grupo, está archivado o es un combo.
 */
export async function loadAdoptableProduct(storeId: string, productId: string): Promise<ImportedProduct | null> {
  // Lleva costo y proveedor: solo la dueña de la tienda.
  await requireStoreOwner(storeId);
  const product = await prismadb.product.findFirst({
    where: { id: productId, storeId, productGroupId: null, isArchived: false, isKit: false },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      price: true,
      acqPrice: true,
      stock: true,
      supplierId: true,
      isFeatured: true,
      isArchived: true,
      description: true,
      gtin: true,
      mpn: true,
      hasNoProductIdentifier: true,
      category: { select: { id: true, name: true } },
      size: { select: { id: true, name: true, value: true } },
      color: { select: { id: true, name: true, value: true } },
      design: { select: { id: true, name: true } },
      images: { select: { url: true }, orderBy: GALLERY_ORDER },
    },
  });
  if (!product) return null;
  return {
    ...product,
    price: Number(product.price),
    acqPrice: product.acqPrice === null ? undefined : Number(product.acqPrice),
    supplierId: product.supplierId ?? undefined,
    size: product.size ? { ...product.size, value: product.size.value ?? "" } : undefined,
    color: product.color ?? undefined,
    design: product.design ?? undefined,
  };
}
