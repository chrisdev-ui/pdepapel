import { CapsuleEditionStatus, CapsuleSlipKind, CapsuleSlipStatus, MarketplaceConnectionStatus, MarketplaceProvider, OrderStatus, PaymentMethod } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", async (importOriginal) => ({ ...(await importOriginal<object>()), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));

import { createCapsuleEdition, updateCapsuleEdition } from "@/lib/capsule-editions";
import { printCapsuleSlips } from "@/lib/capsule-slips";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Crear una edición enlaza un producto que Paula ya armó: tiene que empezar
 * sin stock, con el precio de una cápsula del pack de 5, fuera de Mercado
 * Libre y fuera de un grupo; queda archivado y no se restaura desde la ficha
 * hasta que la edición se abra a la venta.
 */
let f: InventoryFixture | undefined;

const make = (name: string, data: Record<string, unknown> = {}) =>
  testPrisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomBytes(4).toString("hex")}`,
      description: "Producto de pruebas",
      stock: 0,
      price: 12900,
      acqPrice: 0,
      sku: `ED-${randomBytes(4).toString("hex")}`,
      storeId: f!.store.id,
      categoryId: f!.category.id,
      colorId: f!.component.colorId,
      sizeId: f!.component.sizeId,
      designId: f!.component.designId,
      ...data,
    },
  });

const create = (productId: string, extra: Record<string, unknown> = {}) =>
  createCapsuleEdition({ storeId: f!.store.id, productId, name: "Escritorio", theme: "escritorio", costBandMin: 3000, costBandMax: 5000, userId: "paula", ...extra });

const signIn = (role: "owner" | "viewer") => {
  session.userId = role === "owner" ? f!.store.userId : "user_viewer_editions";
  session.claims = role === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [f!.store.id] } } : {};
};

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

describe("crear una edición", () => {
  it("enlaza el producto, lo archiva y numera desde la edición más alta", async () => {
    f = await createInventoryFixture();
    const first = await create((await make("Edicion uno")).id);
    expect(first).toMatchObject({ number: 1, status: CapsuleEditionStatus.DRAFT });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: first.productId } })).resolves.toMatchObject({ isArchived: true });
    await testPrisma.capsuleEdition.update({ where: { id: first.id }, data: { number: 7 } });
    await expect(create((await make("Edicion dos")).id)).resolves.toMatchObject({ number: 8 });
  });

  it("rechaza un producto con stock, con otro precio, en un grupo, kit, ya enlazado o publicado en Mercado Libre", async () => {
    f = await createInventoryFixture();
    await expect(create((await make("Con stock", { stock: 3 })).id)).rejects.toMatchObject({ statusCode: 400 });
    await expect(create((await make("Otro precio", { price: 15000 })).id)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("cápsula del pack de 5") });
    await expect(create(f.kit.id)).rejects.toMatchObject({ statusCode: 400 });
    const group = await testPrisma.productGroup.create({ data: { storeId: f.store.id, name: "Grupo", slug: `grupo-${randomBytes(4).toString("hex")}`, description: "Grupo de pruebas" } });
    await expect(create((await make("En grupo", { productGroupId: group.id })).id)).rejects.toMatchObject({ statusCode: 400 });
    const listed = await make("Publicado");
    const connection = await testPrisma.marketplaceConnection.create({ data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: MarketplaceConnectionStatus.CONNECTED, sellerId: `s-${randomBytes(4).toString("hex")}` } });
    await testPrisma.marketplaceListing.create({ data: { connectionId: connection.id, productId: listed.id, externalItemId: `MCO-${randomBytes(4).toString("hex")}`, status: "ACTIVE" } });
    await expect(create(listed.id)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("Mercado Libre") });
    const linked = await make("Enlazado");
    await create(linked.id);
    await expect(create(linked.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(testPrisma.capsuleEdition.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
    await testPrisma.productGroup.deleteMany({ where: { storeId: f.store.id } });
  });

  it("el producto de una edición no se restaura desde el lote mientras la edición no está a la venta", async () => {
    f = await createInventoryFixture();
    signIn("owner");
    const edition = await create((await make("Edicion lote")).id);
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const response = await POST(
      new Request(`https://admin.test/api/${f.store.id}/products/bulk-update`, { method: "POST", body: JSON.stringify({ field: "isArchived", value: false, productIds: [edition.productId] }) }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(409);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: edition.productId } })).resolves.toMatchObject({ isArchived: true });
  });
});

describe("cambiar una edición", () => {
  it("pasa a vista previa y vuelve; sin la bandera la venta no se abre", async () => {
    f = await createInventoryFixture();
    const edition = await create((await make("Edicion estados")).id);
    const base = { storeId: f.store.id, editionId: edition.id, userId: "paula" };
    await expect(updateCapsuleEdition({ ...base, status: CapsuleEditionStatus.PREVIEW })).resolves.toMatchObject({ status: CapsuleEditionStatus.PREVIEW });
    vi.stubEnv("CAPSULE_SALES_TEST_OVERRIDE", "");
    try {
      await expect(updateCapsuleEdition({ ...base, status: CapsuleEditionStatus.LIVE })).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(updateCapsuleEdition({ ...base, status: CapsuleEditionStatus.DRAFT })).resolves.toMatchObject({ status: CapsuleEditionStatus.DRAFT });
  });

  it("con la bandera abre una sola edición a la venta por tienda, con sus packs, y su producto sigue archivado", async () => {
    f = await createInventoryFixture();
    signIn("owner");
    const first = await create((await make("Edicion uno")).id);
    const second = await create((await make("Edicion dos")).id);
    const base = (editionId: string) => ({ storeId: f!.store.id, editionId, userId: "paula" });
    await updateCapsuleEdition({ ...base(first.id), status: CapsuleEditionStatus.PREVIEW });
    await updateCapsuleEdition({ ...base(second.id), status: CapsuleEditionStatus.PREVIEW });
    // Sin packs no abre.
    await expect(updateCapsuleEdition({ ...base(first.id), status: CapsuleEditionStatus.LIVE })).rejects.toMatchObject({ statusCode: 409 });
    for (const edition of [first, second]) await testPrisma.capsulePackOption.create({ data: { editionId: edition.id, packSize: 5 } });
    await expect(updateCapsuleEdition({ ...base(first.id), status: CapsuleEditionStatus.LIVE })).resolves.toMatchObject({ status: CapsuleEditionStatus.LIVE });
    await expect(updateCapsuleEdition({ ...base(second.id), status: CapsuleEditionStatus.LIVE })).rejects.toMatchObject({ statusCode: 409 });

    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const restore = await POST(
      new Request(`https://admin.test/api/${f.store.id}/products/bulk-update`, { method: "POST", body: JSON.stringify({ field: "isArchived", value: false, productIds: [first.productId] }) }),
      { params: { storeId: f.store.id } },
    );
    expect(restore.status).toBe(409);

    // Pausar (vista previa) deja abrir la otra.
    await expect(updateCapsuleEdition({ ...base(first.id), status: CapsuleEditionStatus.PREVIEW })).resolves.toMatchObject({ status: CapsuleEditionStatus.PREVIEW });
    await expect(updateCapsuleEdition({ ...base(second.id), status: CapsuleEditionStatus.LIVE })).resolves.toMatchObject({ status: CapsuleEditionStatus.LIVE });
  });

  it("la banda no cambia después de imprimir papeles", async () => {
    f = await createInventoryFixture();
    const edition = await create((await make("Edicion banda")).id);
    const base = { storeId: f.store.id, editionId: edition.id, userId: "paula" };
    await expect(updateCapsuleEdition({ ...base, costBandMin: 3500 })).resolves.toMatchObject({ costBandMin: 3500 });
    await printCapsuleSlips({ storeId: f.store.id, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: f.component.id, quantity: 2 }], userId: "paula" });
    await expect(updateCapsuleEdition({ ...base, costBandMax: 6000 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("cerrar anula lo impreso y libera el apartado, pero no con un pedido sin terminar", async () => {
    f = await createInventoryFixture();
    const edition = await create((await make("Edicion cierre")).id);
    await printCapsuleSlips({ storeId: f.store.id, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: f.component.id, quantity: 3 }], userId: "paula" });
    const order = await testPrisma.order.create({
      data: { storeId: f.store.id, orderNumber: `CAP-${randomBytes(4).toString("hex")}`, status: OrderStatus.PAID, subtotal: 64500, total: 64500, payment: { create: { method: PaymentMethod.Bold, storeId: f.store.id } } },
    });
    await testPrisma.capsuleOrder.create({ data: { storeId: f.store.id, orderId: order.id, editionId: edition.id, packSize: 5 } });
    const base = { storeId: f.store.id, editionId: edition.id, userId: "paula", status: CapsuleEditionStatus.CLOSED };
    await expect(updateCapsuleEdition(base)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("sin terminar") });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).resolves.toMatchObject({ reservedUnits: 3 });

    await testPrisma.capsuleOrder.update({ where: { orderId: order.id }, data: { drawCompletedAt: new Date() } });
    await expect(updateCapsuleEdition(base)).resolves.toMatchObject({ status: CapsuleEditionStatus.CLOSED, closedAt: expect.any(Date) });
    await expect(testPrisma.capsuleSlip.count({ where: { editionId: edition.id, status: CapsuleSlipStatus.VOID } })).resolves.toBe(3);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).resolves.toMatchObject({ reservedUnits: 0 });
    await expect(updateCapsuleEdition({ ...base, name: "Otra" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("API de ediciones", () => {
  it("la dueña crea y lista; la cuenta de solo lectura no entra", async () => {
    f = await createInventoryFixture();
    const product = await make("Edicion api");
    const { GET, POST } = await import("@/app/api/[storeId]/capsule-editions/route");
    const params = { params: { storeId: f.store.id } };
    signIn("owner");
    const created = await POST(
      new Request(`https://admin.test/api/${f.store.id}/capsule-editions`, { method: "POST", body: JSON.stringify({ productId: product.id, name: "Escritorio", theme: "escritorio", costBandMin: 3000, costBandMax: 5000 }) }),
      params,
    );
    expect(created.status).toBe(201);
    const list = await (await GET(new Request("https://admin.test/x"), params)).json();
    expect(list.editions).toEqual([expect.objectContaining({ number: 1, name: "Escritorio", unsold: 0 })]);

    signIn("viewer");
    expect((await GET(new Request("https://admin.test/x"), params)).status).toBe(403);
    const { GET: getOne } = await import("@/app/api/[storeId]/capsule-editions/[editionId]/route");
    expect((await getOne(new Request("https://admin.test/x"), { params: { storeId: f.store.id, editionId: list.editions[0].id } })).status).toBe(403);
  });
});
