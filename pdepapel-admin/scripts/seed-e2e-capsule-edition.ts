import { CapsuleSlipKind, PrismaClient } from "@prisma/client";

import { createCapsulePreviewToken } from "@/lib/capsule-preview";
import { editionPathSegment } from "@/lib/capsule-public";
import { printCapsuleSlips } from "@/lib/capsule-slips";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { assertTestDatabaseEnv } from "./lib/test-database.mjs";
import { TEST_ENV_STUBS } from "./lib/test-isolation.mjs";

/**
 * Una edición de cápsulas para las e2e locales de la tienda, impresa por el
 * camino real (`printCapsuleSlips`), y su enlace de vista previa firmado con
 * la clave de prueba del servidor aislado (`TEST_ENV_STUBS`). `clean` la borra.
 *
 *   node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs tsx scripts/seed-e2e-capsule-edition.ts seed|clean
 */
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const EDITION_NUMBER = 901;
const PRODUCTS = [
  { id: "e2e-store-capsule-lapicero", name: "Lapicero estrellita", stock: 24 },
  { id: "e2e-store-capsule-borrador", name: "Borrador nube", stock: 16 },
];
const EDITION_PRODUCT_ID = "e2e-store-capsule-edition";

const db = new PrismaClient({ datasourceUrl: assertTestDatabaseEnv(process.env, "seed-e2e-capsule-edition") });

async function clean() {
  const editions = (await db.capsuleEdition.findMany({ where: { storeId, number: EDITION_NUMBER }, select: { id: true } })).map((row) => row.id);
  const products = [...PRODUCTS.map((product) => product.id), EDITION_PRODUCT_ID];
  await db.capsuleSlip.deleteMany({ where: { editionId: { in: editions } } });
  await db.capsulePackOption.deleteMany({ where: { editionId: { in: editions } } });
  await db.capsuleBatchItem.deleteMany({ where: { batch: { editionId: { in: editions } } } });
  await db.capsuleBatch.deleteMany({ where: { editionId: { in: editions } } });
  await db.capsuleEdition.deleteMany({ where: { id: { in: editions } } });
  await db.productPriceTier.deleteMany({ where: { productId: { in: products } } });
  await db.inventoryMovement.deleteMany({ where: { productId: { in: products } } });
  await db.marketplaceOutboxEvent.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
}

async function seed() {
  await clean();
  const base = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { categoryId: true, sizeId: true, colorId: true, designId: true } });
  const common = { storeId, categoryId: base.categoryId, sizeId: base.sizeId, colorId: base.colorId, designId: base.designId, description: "Producto de pruebas de cápsulas" };
  for (const product of PRODUCTS) {
    await db.product.create({ data: { ...common, id: product.id, name: product.name, slug: product.id, sku: product.id.toUpperCase(), stock: product.stock, price: 9000, acqPrice: 4000 } });
  }
  await db.product.create({
    data: { ...common, id: EDITION_PRODUCT_ID, name: "Cápsulas Escritorio", slug: EDITION_PRODUCT_ID, sku: EDITION_PRODUCT_ID.toUpperCase(), stock: 0, price: 12900, acqPrice: 0, isArchived: true },
  });
  const edition = await db.capsuleEdition.create({
    data: { storeId, number: EDITION_NUMBER, name: "Escritorio", theme: "escritorio", productId: EDITION_PRODUCT_ID, costBandMin: 3000, costBandMax: 5000, minMarginPct: 50 },
  });
  for (const price of CAPSULE_PACK_PRICES) {
    const gift = price.packSize >= 10;
    await db.capsulePackOption.create({
      data: { editionId: edition.id, packSize: price.packSize, giftMaxCost: gift ? 2000 : 0, giftMaxItems: gift ? 1 : 0, giftLabel: gift ? "1 regalo sorpresa" : null, boxReserveCost: 1000 },
    });
  }
  await printCapsuleSlips({ storeId, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: PRODUCTS.map((product) => ({ productId: product.id, quantity: product.stock })), userId: "e2e" });
  const { token } = createCapsulePreviewToken({ storeId, editionId: edition.id }, new Date(), TEST_ENV_STUBS.NEWSLETTER_EARLY_ACCESS_SECRET);
  console.log(JSON.stringify({ segment: editionPathSegment(edition), token }));
}

const mode = process.argv[2];
(mode === "clean" ? clean() : mode === "seed" ? seed() : Promise.reject(new Error("Usa seed o clean")))
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
