/** Lo que la administración entrega de una edición de cápsulas (sin costos). */
export interface CapsuleEditionPublic {
  edition: { number: number; name: string; theme: string; segment: string; status: string };
  preview: boolean;
  salesEnabled: boolean;
  product: { slug: string; name: string; description: string; images: string[] };
  gallery: { name: string; imageUrl: string | null }[];
  packs: {
    packSize: number;
    total: number;
    unitPrice: number;
    saving: number;
    giftLabel: string | null;
    available: boolean;
    boxType: string;
  }[];
  day: { cap: number; left: number; opensAt: string; closedReason: "before-open" | "full" | null };
}
