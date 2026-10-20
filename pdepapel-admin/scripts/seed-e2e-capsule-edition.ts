import { assertTestDatabaseEnv } from "./lib/test-database.mjs";
import { blockOutboundNetwork, NOT_STUBBED, TEST_ENV_STUBS } from "./lib/test-isolation.mjs";

/**
 * Ediciones de cápsulas para las e2e locales de la tienda, por los caminos
 * reales (`printCapsuleSlips`, `drawCapsuleSlip`, `completeCapsuleDraw`).
 *
 * Corre fuera del servidor aislado, así que antes de cargar nada: todas las
 * claves pasan a sus valores de prueba (Prisma ya copió el `.env` real en
 * process.env) y ninguna conexión sale de la máquina.
 *
 *   node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs npx tsx scripts/seed-e2e-capsule-edition.ts <modo>
 *
 * - `seed`: edición #901 en borrador, con su enlace de vista previa (P3).
 * - `seed-live`: edición #902 a la venta (cupos desde medianoche).
 * - `draw-close <orderId>`: saca los papeles y el regalo del pedido y cierra el sorteo.
 * - `clean`: borra las dos ediciones, sus productos y sus pedidos.
 */
for (const [name, value] of Object.entries(TEST_ENV_STUBS)) {
  if (!NOT_STUBBED.has(name)) process.env[name] = value;
}
blockOutboundNetwork();

const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const EDITIONS = {
  preview: { number: 901, productId: "e2e-store-capsule-edition", slips: [{ id: "e2e-store-capsule-lapicero", name: "Lapicero estrellita", stock: 24 }, { id: "e2e-store-capsule-borrador", name: "Borrador nube", stock: 16 }] },
  live: { number: 902, productId: "e2e-store-capsule-live", slips: [{ id: "e2e-store-capsule-live-lapiz", name: "Lápiz conejito", stock: 24 }, { id: "e2e-store-capsule-live-sticker", name: "Sticker estrella", stock: 16 }] },
} as const;
const GIFT_ID = "e2e-store-capsule-live-regalo";

async function main() {
  const { CapsuleEditionStatus, CapsuleSlipKind, CapsuleSlipStatus, PrismaClient } = await import("@prisma/client");
  const { createCapsulePreviewToken } = await import("@/lib/capsule-preview");
  const { editionPathSegment } = await import("@/lib/capsule-public");
  const { drawCapsuleSlip, printCapsuleSlips } = await import("@/lib/capsule-slips");
  const { completeCapsuleDraw } = await import("@/lib/capsule-orders");
  const { CAPSULE_PACK_PRICES } = await import("@/lib/pricing/capsules");
  const db = new PrismaClient({ datasourceUrl: assertTestDatabaseEnv(process.env, "seed-e2e-capsule-edition") });

  const clean = async () => {
    const editions = (await db.capsuleEdition.findMany({ where: { storeId, number: { in: [EDITIONS.preview.number, EDITIONS.live.number] } }, select: { id: true } })).map((row) => row.id);
    const products = [...Object.values(EDITIONS).flatMap((edition) => [edition.productId, ...edition.slips.map((slip) => slip.id)]), GIFT_ID];
    const orders = (await db.capsuleOrder.findMany({ where: { editionId: { in: editions } }, select: { orderId: true } })).map((row) => row.orderId);
    await db.capsuleSlip.deleteMany({ where: { editionId: { in: editions } } });
    await db.capsuleDailySlot.deleteMany({ where: { orderId: { in: orders } } });
    await db.capsuleOrder.deleteMany({ where: { editionId: { in: editions } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await db.shipping.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentWebhookEvent.deleteMany({ where: { orderId: { in: orders } } }).catch(() => undefined);
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.capsulePackOption.deleteMany({ where: { editionId: { in: editions } } });
    await db.capsuleBatchItem.deleteMany({ where: { batch: { editionId: { in: editions } } } });
    await db.capsuleBatch.deleteMany({ where: { editionId: { in: editions } } });
    await db.capsuleEdition.deleteMany({ where: { id: { in: editions } } });
    await db.capsuleDayCap.deleteMany({ where: { storeId } });
    await db.productPriceTier.deleteMany({ where: { productId: { in: products } } });
    await db.inventoryMovement.deleteMany({ where: { productId: { in: products } } });
    await db.marketplaceOutboxEvent.deleteMany({ where: { productId: { in: products } } });
    await db.product.deleteMany({ where: { id: { in: products } } });
  };

  const seedEdition = async (kind: "preview" | "live") => {
    const spec = EDITIONS[kind];
    const base = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { categoryId: true, sizeId: true, colorId: true, designId: true } });
    const common = { storeId, categoryId: base.categoryId, sizeId: base.sizeId, colorId: base.colorId, designId: base.designId, description: "Producto de pruebas de cápsulas" };
    for (const product of spec.slips) {
      await db.product.create({ data: { ...common, id: product.id, name: product.name, slug: product.id, sku: product.id.toUpperCase(), stock: product.stock, price: 9000, acqPrice: 4000 } });
    }
    await db.product.create({
      data: { ...common, id: spec.productId, name: "Cápsulas Escritorio", slug: spec.productId, sku: spec.productId.toUpperCase(), stock: 0, price: 12900, acqPrice: 0, isArchived: true },
    });
    const edition = await db.capsuleEdition.create({
      data: { storeId, number: spec.number, name: "Escritorio", theme: "escritorio", productId: spec.productId, costBandMin: 3000, costBandMax: 5000, minMarginPct: 50, opensAtLocal: kind === "live" ? "00:00" : "08:00" },
    });
    for (const price of CAPSULE_PACK_PRICES) {
      const gift = price.packSize >= 10;
      await db.capsulePackOption.create({
        data: { editionId: edition.id, packSize: price.packSize, giftMaxCost: gift ? 2000 : 0, giftMaxItems: gift ? 1 : 0, giftLabel: gift ? "1 regalo sorpresa" : null, boxReserveCost: 1000 },
      });
      await db.productPriceTier.create({ data: { storeId, productId: spec.productId, minQuantity: price.packSize, unitPrice: price.total / price.packSize } });
    }
    await printCapsuleSlips({ storeId, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: spec.slips.map((product) => ({ productId: product.id, quantity: product.stock })), userId: "e2e" });
    if (kind === "live") {
      await db.product.create({ data: { ...common, id: GIFT_ID, name: "Llavero gatito", slug: GIFT_ID, sku: GIFT_ID.toUpperCase(), stock: 3, price: 5000, acqPrice: 1500 } });
      await printCapsuleSlips({ storeId, editionId: edition.id, kind: CapsuleSlipKind.GIFT, items: [{ productId: GIFT_ID, quantity: 3 }], userId: "e2e" });
      await db.capsuleEdition.update({ where: { id: edition.id }, data: { status: CapsuleEditionStatus.LIVE } });
      return { segment: editionPathSegment(edition), productId: spec.productId };
    }
    const { token } = createCapsulePreviewToken({ storeId, editionId: edition.id }, new Date(), TEST_ENV_STUBS.NEWSLETTER_EARLY_ACCESS_SECRET);
    return { segment: editionPathSegment(edition), token };
  };

  const drawAndClose = async (orderId: string) => {
    const capsuleOrder = await db.capsuleOrder.findUniqueOrThrow({ where: { orderId } });
    const slips = await db.capsuleSlip.findMany({ where: { editionId: capsuleOrder.editionId, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED }, take: capsuleOrder.packSize, orderBy: { code: "asc" } });
    const gifts = capsuleOrder.giftMaxItems > 0 ? await db.capsuleSlip.findMany({ where: { editionId: capsuleOrder.editionId, kind: CapsuleSlipKind.GIFT, status: CapsuleSlipStatus.PRINTED }, take: 1 }) : [];
    for (const slip of [...slips, ...gifts]) await drawCapsuleSlip({ storeId, orderId, code: slip.code, userId: "e2e" });
    const closed = await completeCapsuleDraw({ storeId, orderId });
    return { realCost: closed.realCost, guideQueued: closed.guideQueued };
  };

  const [mode, arg] = process.argv.slice(2);
  try {
    if (mode === "clean") await clean();
    else if (mode === "seed") {
      await clean();
      console.log(JSON.stringify(await seedEdition("preview")));
    } else if (mode === "seed-live") {
      await clean();
      console.log(JSON.stringify(await seedEdition("live")));
    } else if (mode === "draw-close" && arg) console.log(JSON.stringify(await drawAndClose(arg)));
    else throw new Error("Usa seed, seed-live, draw-close <orderId> o clean");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
