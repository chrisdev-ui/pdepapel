import { CapsuleEditionStatus, CapsuleSlipKind } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { printCapsuleSlips } from "@/lib/capsule-slips";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { testPrisma, type InventoryFixture } from "./database";

/**
 * Una edición de cápsulas a la venta para las pruebas de pedidos: 40 papeles
 * de un lapicero a costo 4.000 (caben los packs de 5 y 10), packs con regalo
 * desde 10 y los cupos abiertos desde medianoche (las pruebas corren a
 * cualquier hora).
 */
export async function createLiveCapsuleEdition(f: InventoryFixture, options: { slips?: number; dailyOrderCap?: number; status?: CapsuleEditionStatus; opensAtLocal?: string } = {}) {
  const store = f.store.id;
  const slips = options.slips ?? 40;
  const base = { storeId: store, categoryId: f.category.id, colorId: f.component.colorId, sizeId: f.component.sizeId, designId: f.component.designId, description: "Producto de pruebas" };
  const suffix = randomBytes(4).toString("hex");
  const lapicero = await testPrisma.product.create({
    data: { ...base, name: "Lapicero cápsula", slug: `lapicero-capsula-${suffix}`, sku: `CAP-L-${suffix}`, stock: slips, price: 9000, acqPrice: 4000 },
  });
  const editionProduct = await testPrisma.product.create({
    data: { ...base, name: "Cápsulas Escritorio", slug: `capsulas-escritorio-${suffix}`, sku: `CAP-E-${suffix}`, stock: 0, price: 12900, acqPrice: 0, isArchived: true },
  });
  const edition = await testPrisma.capsuleEdition.create({
    data: {
      storeId: store,
      number: 7,
      name: "Escritorio",
      theme: "escritorio",
      productId: editionProduct.id,
      costBandMin: 3000,
      costBandMax: 5000,
      dailyOrderCap: options.dailyOrderCap ?? 5,
      opensAtLocal: options.opensAtLocal ?? "00:00",
    },
  });
  for (const price of CAPSULE_PACK_PRICES) {
    const gift = price.packSize >= 10;
    await testPrisma.capsulePackOption.create({
      data: { editionId: edition.id, packSize: price.packSize, giftMaxCost: gift ? 2000 : 0, giftMaxItems: gift ? 1 : 0, giftLabel: gift ? "1 regalo sorpresa" : null, boxReserveCost: 1000 },
    });
    await testPrisma.productPriceTier.create({ data: { storeId: store, productId: editionProduct.id, minQuantity: price.packSize, unitPrice: price.total / price.packSize } });
  }
  await printCapsuleSlips({ storeId: store, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: slips }], userId: "paula" });
  await testPrisma.capsuleEdition.update({ where: { id: edition.id }, data: { status: options.status ?? CapsuleEditionStatus.LIVE } });
  return { edition, editionProduct, lapicero };
}

export const capsuleCustomer = {
  fullName: "Luisa Sánchez",
  phone: "+573009999999",
  email: "luisa@prueba.test",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  department: "Antioquia",
  daneCode: "05001000",
};

/** Cuerpo de checkout (Bold) para un pack, con envío propio de 5.000 (sin EnvioClick). */
export function capsuleCheckoutBody(productId: string, packSize: number, extra: Record<string, unknown> = {}) {
  const total = CAPSULE_PACK_PRICES.find((price) => price.packSize === packSize)?.total ?? 0;
  return {
    ...capsuleCustomer,
    guestId: `guest_${randomBytes(6).toString("hex")}`,
    orderItems: [{ productId, quantity: packSize }],
    payment: { method: "Bold" },
    shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
    envioClickIdRate: 0,
    subtotal: total,
    total: total + 5000,
    capsuleVideoConsent: "PUBLIC_FIRST_NAME",
    ...extra,
  };
}
