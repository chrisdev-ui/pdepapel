import { OrderStatus, PaymentMethod } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

import { savePackOptions } from "@/lib/capsule-pack-options";
import { checkPoolMargins, giftCandidates, slipCandidates } from "@/lib/capsule-pool";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * La bolsa de una edición: papeles por categoría y banda, regalos entre los
 * productos quietos dentro del tope, y el P95 de cada pack contra el margen
 * mínimo de la tienda. Costos de prueba en números redondos.
 */
let f: InventoryFixture | undefined;
const OLD = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

const make = (name: string, data: Record<string, unknown> = {}) =>
  testPrisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomBytes(4).toString("hex")}`,
      description: "Producto de pruebas",
      stock: 10,
      price: 9000,
      acqPrice: 4000,
      sku: `PO-${randomBytes(4).toString("hex")}`,
      storeId: f!.store.id,
      categoryId: f!.category.id,
      colorId: f!.component.colorId,
      sizeId: f!.component.sizeId,
      designId: f!.component.designId,
      createdAt: OLD,
      ...data,
    },
  });

const options = (gift = 2000) =>
  CAPSULE_PACK_PRICES.map((price) => ({ packSize: price.packSize, giftMaxCost: price.packSize >= 10 ? gift : 0, giftMaxItems: price.packSize >= 10 ? 1 : 0, boxReserveCost: 1000 }));

async function setup() {
  f = await createInventoryFixture();
  const editionProduct = await make("Edicion", { stock: 0, price: 12900, acqPrice: 0, isArchived: true });
  const edition = await testPrisma.capsuleEdition.create({
    data: { storeId: f.store.id, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000 },
  });
  return { edition, editionProduct };
}

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) await deleteInventoryFixture(f);
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("candidatos de la bolsa", () => {
  it("papeles: solo las categorías elegidas, dentro de la banda y con algo disponible", async () => {
    const { edition } = await setup();
    const inBand = await make("Lapicero");
    await make("Libreta cara", { acqPrice: 9000 });
    await make("Sin disponible", { stock: 2, reservedUnits: 2 });
    await make("Archivado", { isArchived: true });
    const otherCategory = await testPrisma.category.create({ data: { name: "Otra", slug: `otra-${randomBytes(4).toString("hex")}`, storeId: f!.store.id, typeId: (await testPrisma.category.findUniqueOrThrow({ where: { id: f!.category.id } })).typeId } });
    await make("Otra categoria", { categoryId: otherCategory.id });

    // Con «incluir los que sí se venden»: el componente del fixture (4.000, recién creado) y el lapicero; ni el kit, ni el producto de la edición.
    const all = await slipCandidates({ storeId: f!.store.id, editionId: edition.id, categoryIds: [f!.category.id], onlyIdle: false });
    expect(all.map((row) => row.name)).toEqual(["Lapicero", "Componente"]);
    expect(all.find((row) => row.productId === inBand.id)).toMatchObject({ unitCost: 4000, available: 10, printed: 0, idle: true });
    expect(all.find((row) => row.name === "Componente")).toMatchObject({ idle: false, reason: "Se vende: no está quieto" });
    await expect(slipCandidates({ storeId: f!.store.id, editionId: edition.id, categoryIds: [] })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("papeles: por defecto solo los quietos (la regla del Copiloto), con su razón", async () => {
    const { edition } = await setup();
    await make("Lapicero");
    const sold = await make("Vendido hace poco");
    await testPrisma.order.create({
      data: {
        storeId: f!.store.id,
        orderNumber: `ORD-${randomBytes(4).toString("hex")}`,
        status: OrderStatus.PAID,
        paidAt: new Date(),
        subtotal: 9000,
        total: 9000,
        orderItems: { create: [{ productId: sold.id, quantity: 1, price: 9000, name: "Vendido hace poco" }] },
        payment: { create: { method: PaymentMethod.CASH, storeId: f!.store.id } },
      },
    });

    const rows = await slipCandidates({ storeId: f!.store.id, editionId: edition.id, categoryIds: [f!.category.id] });
    expect(rows.map((row) => row.name)).toEqual(["Lapicero"]);
    expect(rows[0]).toMatchObject({ idle: true, reason: "Sin ventas en el último año · cabe en la banda" });
  });

  it("regalos: productos quietos con costo dentro del tope; ni los vendidos hace poco ni los nuevos", async () => {
    const { edition } = await setup();
    await expect(giftCandidates({ storeId: f!.store.id, editionId: edition.id })).rejects.toMatchObject({ statusCode: 400 });
    for (const option of options()) await testPrisma.capsulePackOption.create({ data: { editionId: edition.id, ...option } });

    await make("Quieto", { acqPrice: 1500 });
    const sold = await make("Vendido hace poco", { acqPrice: 1500 });
    await make("Nuevo", { acqPrice: 1500, createdAt: new Date() });
    await make("Quieto caro", { acqPrice: 2500 });
    await testPrisma.order.create({
      data: {
        storeId: f!.store.id,
        orderNumber: `ORD-${randomBytes(4).toString("hex")}`,
        status: OrderStatus.PAID,
        paidAt: new Date(),
        subtotal: 9000,
        total: 9000,
        orderItems: { create: [{ productId: sold.id, quantity: 1, price: 9000, name: "Vendido hace poco" }] },
        payment: { create: { method: PaymentMethod.CASH, storeId: f!.store.id } },
      },
    });

    const rows = await giftCandidates({ storeId: f!.store.id, editionId: edition.id });
    expect(rows.map((row) => row.name)).toEqual(["Quieto"]);
  });
});

describe("margen de la bolsa", () => {
  it("calcula cada pack que cabe en la bolsa y compara su P95 con el margen mínimo de la tienda", async () => {
    const { edition } = await setup();
    const lapicero = await make("Lapicero", { stock: 30 });
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 40 } });

    // 20 papeles de 4.000: caben los packs de 5 (≤ 25 %) y nada más.
    const check = await checkPoolMargins({ storeId: f!.store.id, editionId: edition.id, proposed: [{ productId: lapicero.id, quantity: 20 }], packOptions: options(), runs: 500 });
    expect(check.poolSize).toBe(20);
    expect(check.minMarginPct).toBe(40);
    expect(check.packs.find((pack) => pack.packSize === 5)).toMatchObject({ available: true, passes: true });
    expect(check.packs.filter((pack) => pack.available).map((pack) => pack.packSize)).toEqual([5]);
    expect(check.packs.find((pack) => pack.packSize === 30)).toMatchObject({ available: false, passes: null, p95Pct: null });
    expect(check.ok).toBe(true);

    // Con un mínimo imposible el pack no pasa.
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 90 } });
    const strict = await checkPoolMargins({ storeId: f!.store.id, editionId: edition.id, proposed: [{ productId: lapicero.id, quantity: 20 }], packOptions: options(), runs: 500 });
    expect(strict.ok).toBe(false);
    expect(strict.packs[0]).toMatchObject({ packSize: 5, passes: false });
  });

  it("el piso de la edición manda sobre el de la tienda, y sin él rige el de la tienda", async () => {
    const { edition } = await setup();
    const lapicero = await make("Lapicero", { stock: 30 });
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 40 } });
    const run = () => checkPoolMargins({ storeId: f!.store.id, editionId: edition.id, proposed: [{ productId: lapicero.id, quantity: 20 }], packOptions: options(), runs: 500 });
    await expect(run()).resolves.toMatchObject({ minMarginPct: 40, floorSource: "store", ok: true });

    const { updateCapsuleEdition } = await import("@/lib/capsule-editions");
    await updateCapsuleEdition({ storeId: f!.store.id, editionId: edition.id, userId: "paula", minMarginPct: 90 });
    await expect(run()).resolves.toMatchObject({ minMarginPct: 90, floorSource: "edition", ok: false });
    await expect(updateCapsuleEdition({ storeId: f!.store.id, editionId: edition.id, userId: "paula", minMarginPct: 120 })).rejects.toMatchObject({ statusCode: 400 });
    await updateCapsuleEdition({ storeId: f!.store.id, editionId: edition.id, userId: "paula", minMarginPct: null });
    await expect(run()).resolves.toMatchObject({ minMarginPct: 40, floorSource: "store" });
  });

  it("una edición sin piso propio se mide al margen mínimo de cápsulas: revisar, guardar packs e imprimir", async () => {
    const { edition } = await setup();
    const lapicero = await make("Lapicero", { stock: 40 });
    // Con el margen de la tienda (40 %) la bolsa pasa; con el de cápsulas (90 %) ya no.
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 40, capsuleMinMarginPct: null } });
    const proposed = [{ productId: lapicero.id, quantity: 40 }];
    const run = () => checkPoolMargins({ storeId: f!.store.id, editionId: edition.id, proposed, packOptions: options(), runs: 500 });
    await expect(run()).resolves.toMatchObject({ minMarginPct: 40, floorSource: "store", ok: true });

    await testPrisma.store.update({ where: { id: f!.store.id }, data: { capsuleMinMarginPct: 90 } });
    await expect(run()).resolves.toMatchObject({ minMarginPct: 90, floorSource: "capsules", ok: false });
    await expect(savePackOptions({ storeId: f!.store.id, editionId: edition.id, options: options(), proposed })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("margen mínimo de 90 %"),
    });

    // Con los packs guardados a un piso que pasa, imprimir también se mide al de cápsulas.
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { capsuleMinMarginPct: 45 } });
    await savePackOptions({ storeId: f!.store.id, editionId: edition.id, options: options(), proposed });
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { capsuleMinMarginPct: 90 } });
    const { printFromPanel } = await import("@/lib/capsule-print");
    await expect(printFromPanel({ storeId: f!.store.id, editionId: edition.id, kind: "SLIP", items: proposed, userId: "paula" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(testPrisma.capsuleSlip.count({ where: { editionId: edition.id } })).resolves.toBe(0);

    // El piso propio de la edición sigue mandando sobre los dos.
    const { updateCapsuleEdition } = await import("@/lib/capsule-editions");
    await updateCapsuleEdition({ storeId: f!.store.id, editionId: edition.id, userId: "paula", minMarginPct: 40 });
    await expect(run()).resolves.toMatchObject({ minMarginPct: 40, floorSource: "edition", ok: true });
  });

  it("sin packs configurados o con un producto sin costo, no calcula", async () => {
    const { edition } = await setup();
    const noCost = await make("Sin costo", { acqPrice: 0 });
    await expect(checkPoolMargins({ storeId: f!.store.id, editionId: edition.id, proposed: [] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(checkPoolMargins({ storeId: f!.store.id, editionId: edition.id, proposed: [{ productId: noCost.id, quantity: 5 }], packOptions: options() })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("guardar los packs exige bolsa, margen mínimo configurado y P95 suficiente; escribe la escalera sin tocar el precio base", async () => {
    const { edition, editionProduct } = await setup();
    const lapicero = await make("Lapicero", { stock: 40 });
    const base = { storeId: f!.store.id, editionId: edition.id, options: options() };
    await expect(savePackOptions({ ...base, proposed: [] })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("Elige la bolsa") });
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: null } });
    await expect(savePackOptions({ ...base, proposed: [{ productId: lapicero.id, quantity: 40 }] })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("margen mínimo") });
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 90 } });
    await expect(savePackOptions({ ...base, proposed: [{ productId: lapicero.id, quantity: 40 }] })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("no llegan al margen mínimo de 90 %") });
    await expect(testPrisma.capsulePackOption.count({ where: { editionId: edition.id } })).resolves.toBe(0);

    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 40 } });
    const saved = await savePackOptions({ ...base, proposed: [{ productId: lapicero.id, quantity: 40 }] });
    expect(saved.check.ok).toBe(true);
    await expect(testPrisma.capsulePackOption.findMany({ where: { editionId: edition.id }, orderBy: { packSize: "asc" } })).resolves.toHaveLength(CAPSULE_PACK_PRICES.length);
    const tiers = await testPrisma.productPriceTier.findMany({ where: { productId: editionProduct.id }, orderBy: { minQuantity: "asc" } });
    expect(tiers.map((tier) => [tier.minQuantity, tier.unitPrice])).toEqual([[10, 12490], [15, 11990], [20, 11745], [25, 11596], [30, 11330]]);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: editionProduct.id } })).resolves.toMatchObject({ price: 12900 });

    // Guardar de nuevo reemplaza, y con la edición a la venta ya no se cambia.
    await savePackOptions({ ...base, options: options(1500), proposed: [{ productId: lapicero.id, quantity: 40 }] });
    await expect(testPrisma.capsulePackOption.findFirstOrThrow({ where: { editionId: edition.id, packSize: 10 } })).resolves.toMatchObject({ giftMaxCost: 1500 });
    await testPrisma.capsuleEdition.update({ where: { id: edition.id }, data: { status: "LIVE" } });
    await expect(savePackOptions({ ...base, proposed: [{ productId: lapicero.id, quantity: 40 }] })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("las rutas de la bolsa son solo de la dueña", async () => {
    const { edition } = await setup();
    session.userId = "user_viewer_pool";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [f!.store.id] } };
    const { GET } = await import("@/app/api/[storeId]/capsule-editions/[editionId]/candidates/route");
    const { POST } = await import("@/app/api/[storeId]/capsule-editions/[editionId]/margin-check/route");
    const params = { params: { storeId: f!.store.id, editionId: edition.id } };
    expect((await GET(new Request(`https://admin.test/x?tipo=papeles&categorias=${f!.category.id}`), params)).status).toBe(403);
    expect((await POST(new Request("https://admin.test/x", { method: "POST", body: JSON.stringify({ pool: [] }) }), params)).status).toBe(403);
    const { PUT } = await import("@/app/api/[storeId]/capsule-editions/[editionId]/pack-options/route");
    expect((await PUT(new Request("https://admin.test/x", { method: "PUT", body: JSON.stringify({ options: options() }) }), params)).status).toBe(403);
  });
});
