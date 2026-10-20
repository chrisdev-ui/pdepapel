import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Product } from "@/types";
import type { CapsuleEditionPublic } from "@/types/capsules";

export type CapsuleVideoConsent = "PRIVATE" | "PUBLIC_FIRST_NAME";

/**
 * El pack de cápsulas camino al pago. Va aparte del carrito: el pack se
 * compra solo, sin cupones, y su producto (archivado) no vive en el catálogo
 * que el carrito vuelve a sincronizar. `/finalizar-compra?capsulas=1` lo usa
 * en lugar del carrito. Dura la pestaña (sessionStorage).
 */
interface CapsulePackStore {
  items: Product[];
  videoConsent: CapsuleVideoConsent;
  editionSegment: string | null;
  setPack: (
    edition: CapsuleEditionPublic,
    packSize: number,
    videoConsent: CapsuleVideoConsent,
  ) => void;
  removeAll: () => void;
}

/** El pack como una línea de pedido: el producto de la edición × el pack, al precio por cápsula del peldaño. */
export function capsulePackItem(
  edition: CapsuleEditionPublic,
  packSize: number,
): Product {
  const pack = edition.packs.find((row) => row.packSize === packSize);
  return {
    id: edition.product.id,
    slug: edition.product.slug,
    name: `${edition.product.name} · pack de ${packSize}`,
    description: "",
    price: String(pack?.unitPrice ?? 0),
    stock: packSize,
    isFeatured: false,
    sku: "",
    category: { id: "", name: "Cápsulas sorpresa" },
    images: edition.product.images.map((url, index) => ({
      id: String(index),
      url,
      isMain: index === 0,
    })),
    reviews: [],
    quantity: packSize,
  } as unknown as Product;
}

export const useCapsulePack = create(
  persist<CapsulePackStore>(
    (set) => ({
      items: [],
      videoConsent: "PRIVATE",
      editionSegment: null,
      setPack: (edition, packSize, videoConsent) =>
        set({
          items: [capsulePackItem(edition, packSize)],
          videoConsent,
          editionSegment: edition.edition.segment,
        }),
      removeAll: () => set({ items: [], editionSegment: null }),
    }),
    { name: "capsule-pack", storage: createJSONStorage(() => sessionStorage) },
  ),
);
