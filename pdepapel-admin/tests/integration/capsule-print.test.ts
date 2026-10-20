import { CapsuleSlipKind, CapsuleSlipStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", async (importOriginal) => ({ ...(await importOriginal<object>()), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));

import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Imprimir desde el panel: los papeles pasan la revisión de margen contra los
 * packs guardados; la respuesta trae el código y el nombre que lleva cada
 * papel. Anular desde el panel libera el apartado. Solo la dueña.
 */
let f: InventoryFixture | undefined;

async function setup() {
  f = await createInventoryFixture();
  const make = (name: string, data: Record<string, unknown>) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomBytes(4).toString("hex")}`,
        description: "Producto de pruebas",
        price: 9000,
        sku: `PR-${randomBytes(4).toString("hex")}`,
        storeId: f!.store.id,
        categoryId: f!.category.id,
        colorId: f!.component.colorId,
        sizeId: f!.component.sizeId,
        designId: f!.component.designId,
        ...data,
      } as never,
    });
  const lapicero = await make("Lapicero", { stock: 40, acqPrice: 4000 });
  const regalo = await make("Stickers", { stock: 5, acqPrice: 1500 });
  const editionProduct = await make("Edicion", { stock: 0, acqPrice: 0, price: 12900, isArchived: true });
  const edition = await testPrisma.capsuleEdition.create({
    data: { storeId: f.store.id, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000 },
  });
  for (const price of CAPSULE_PACK_PRICES) {
    await testPrisma.capsulePackOption.create({
      data: { editionId: edition.id, packSize: price.packSize, giftMaxCost: price.packSize >= 10 ? 2000 : 0, giftMaxItems: price.packSize >= 10 ? 1 : 0, boxReserveCost: 1000 },
    });
  }
  session.userId = f.store.userId;
  session.claims = {};
  return { lapicero, regalo, edition };
}

const post = async (editionId: string, body: unknown, route: "slips" | "void" = "slips") => {
  const module = route === "slips" ? await import("@/app/api/[storeId]/capsule-editions/[editionId]/slips/route") : await import("@/app/api/[storeId]/capsule-editions/[editionId]/slips/void/route");
  return module.POST(new Request("https://admin.test/x", { method: "POST", body: JSON.stringify(body) }), { params: { storeId: f!.store.id, editionId } });
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

describe("imprimir y anular desde el panel", () => {
  it("imprime papeles que pasan el margen y devuelve el código y el producto de cada uno", async () => {
    const { lapicero, edition } = await setup();
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 40 } });
    const response = await post(edition.id, { kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: 20 }] });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.printed).toBe(20);
    expect(body.slips[0]).toEqual({ id: expect.any(String), code: expect.stringMatching(/^CAP-E1-/), kind: "SLIP", productName: "Lapicero", sku: expect.any(String) });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: lapicero.id } })).resolves.toMatchObject({ reservedUnits: 20 });
  });

  it("no imprime papeles que dejan un pack bajo el margen mínimo, ni sin mínimo configurado", async () => {
    const { lapicero, edition } = await setup();
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 90 } });
    const strict = await post(edition.id, { kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: 20 }] });
    expect(strict.status).toBe(409);
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: null } });
    expect((await post(edition.id, { kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: 20 }] })).status).toBe(400);
    await expect(testPrisma.capsuleSlip.count({ where: { editionId: edition.id } })).resolves.toBe(0);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: lapicero.id } })).resolves.toMatchObject({ reservedUnits: 0 });
  });

  it("los regalos no pasan por la revisión de margen; anular libera el apartado", async () => {
    const { regalo, edition } = await setup();
    await testPrisma.store.update({ where: { id: f!.store.id }, data: { storeMinMarginPercent: 90 } });
    const printed = await post(edition.id, { kind: CapsuleSlipKind.GIFT, items: [{ productId: regalo.id, quantity: 2 }] });
    expect(printed.status).toBe(201);
    const { slips } = await printed.json();
    const voided = await post(edition.id, { slipIds: [slips[0].id] }, "void");
    expect(voided.status).toBe(200);
    await expect(testPrisma.capsuleSlip.findUniqueOrThrow({ where: { id: slips[0].id } })).resolves.toMatchObject({ status: CapsuleSlipStatus.VOID });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: regalo.id } })).resolves.toMatchObject({ reservedUnits: 1 });
    expect((await post(edition.id, { slipIds: [] }, "void")).status).toBe(400);
  });

  it("la cuenta de solo lectura no imprime ni anula", async () => {
    const { lapicero, edition } = await setup();
    session.userId = "user_viewer_print";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [f!.store.id] } };
    expect((await post(edition.id, { kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: 5 }] })).status).toBe(403);
    expect((await post(edition.id, { slipIds: ["x"] }, "void")).status).toBe(403);
  });
});
