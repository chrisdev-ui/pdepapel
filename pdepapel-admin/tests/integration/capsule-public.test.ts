import { CapsuleEditionStatus, CapsuleSlipKind } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

import { createCapsulePreviewToken } from "@/lib/capsule-preview";
import { canSeeEdition, getPublicCapsuleEdition } from "@/lib/capsule-public";
import { capsulePackageFor } from "@/lib/capsule-quote";
import { printCapsuleSlips } from "@/lib/capsule-slips";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * La edición para la tienda: solo con la venta encendida y LIVE, o con el
 * enlace de vista previa de esa edición; nunca cerrada. Sin costos, banda,
 * topes, códigos ni ids de la bolsa. Y la cotización de un pack usa la caja
 * del peor caso.
 */
const SECRET = process.env.NEWSLETTER_EARLY_ACCESS_SECRET ?? "test-stub-newsletter-early-access";
let f: InventoryFixture | undefined;

async function setup() {
  f = await createInventoryFixture();
  const store = f.store.id;
  const make = (name: string, data: Record<string, unknown>) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomBytes(4).toString("hex")}`,
        description: "Producto de pruebas",
        price: 9000,
        sku: `PU-${randomBytes(4).toString("hex")}`,
        storeId: store,
        categoryId: f!.category.id,
        colorId: f!.component.colorId,
        sizeId: f!.component.sizeId,
        designId: f!.component.designId,
        ...data,
      } as never,
    });
  const lapicero = await make("Lapicero", { stock: 40, acqPrice: 4000 });
  const editionProduct = await make("Edicion Escritorio", { stock: 0, acqPrice: 0, price: 12900, isArchived: true, description: "Cápsulas de escritorio" });
  const edition = await testPrisma.capsuleEdition.create({
    data: { storeId: store, number: 3, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000, minMarginPct: 50 },
  });
  for (const price of CAPSULE_PACK_PRICES) {
    await testPrisma.capsulePackOption.create({ data: { editionId: edition.id, packSize: price.packSize, giftMaxCost: price.packSize >= 10 ? 2000 : 0, giftMaxItems: price.packSize >= 10 ? 1 : 0, giftLabel: price.packSize >= 10 ? "1 regalo sorpresa" : null, boxReserveCost: 1000 } });
  }
  await printCapsuleSlips({ storeId: store, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: 40 }], userId: "paula" });
  return { edition, editionProduct, lapicero };
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

describe("quién ve una edición en la tienda", () => {
  it("la bandera, el estado y el enlace de vista previa deciden", () => {
    // Venta apagada: solo con enlace, en cualquier estado salvo cerrada.
    expect(canSeeEdition(CapsuleEditionStatus.LIVE, false, false)).toBe(false);
    expect(canSeeEdition(CapsuleEditionStatus.DRAFT, false, true)).toBe(true);
    expect(canSeeEdition(CapsuleEditionStatus.PREVIEW, false, true)).toBe(true);
    // Venta encendida: LIVE sin enlace; DRAFT/PREVIEW solo con enlace.
    expect(canSeeEdition(CapsuleEditionStatus.LIVE, true, false)).toBe(true);
    expect(canSeeEdition(CapsuleEditionStatus.PREVIEW, true, false)).toBe(false);
    expect(canSeeEdition(CapsuleEditionStatus.DRAFT, true, true)).toBe(true);
    // Cerrada: nunca.
    expect(canSeeEdition(CapsuleEditionStatus.CLOSED, true, true)).toBe(false);
    expect(canSeeEdition(CapsuleEditionStatus.CLOSED, false, true)).toBe(false);
  });

  it("con la venta apagada responde 404 sin enlace y la edición con el enlace de esa edición", async () => {
    const { edition } = await setup();
    const { GET } = await import("@/app/api/[storeId]/capsulas/[edicion]/route");
    const params = { params: { storeId: f!.store.id, edicion: "3-escritorio" } };
    expect((await GET(new Request("https://admin.test/x"), params)).status).toBe(404);
    const other = createCapsulePreviewToken({ storeId: f!.store.id, editionId: "otra" }, new Date(), SECRET).token;
    expect((await GET(new Request(`https://admin.test/x?vista=${other}`), params)).status).toBe(404);
    const { token } = createCapsulePreviewToken({ storeId: f!.store.id, editionId: edition.id }, new Date(), SECRET);
    const response = await GET(new Request(`https://admin.test/x?vista=${token}`), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ preview: true, salesEnabled: false, edition: { number: 3, name: "Escritorio", segment: "3-escritorio" }, gallery: [{ name: "Lapicero" }] });
  });

  it("la respuesta no lleva costos, banda, topes, códigos ni ids", async () => {
    const { edition } = await setup();
    const { token } = createCapsulePreviewToken({ storeId: f!.store.id, editionId: edition.id }, new Date(), SECRET);
    const payload = await getPublicCapsuleEdition({ storeId: f!.store.id, segment: "3", token });
    assertNoForbiddenKeys(payload, "viewer");
    const text = JSON.stringify(payload);
    for (const key of ["unitCost", "acqPrice", "provisionalCost", "minMarginPct", "costBandMin", "costBandMax", "giftMaxCost", "boxReserveCost", "reservedUnits", "stock", "productId", "\"id\""]) expect(text).not.toContain(key);
    const codes = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id }, select: { code: true }, take: 3 });
    for (const { code } of codes) expect(text).not.toContain(code);
  });

  it("los packs: precio, por cápsula, ahorro, regalo y disponibles solo hasta el 25 % de lo que queda", async () => {
    const { edition } = await setup();
    const { token } = createCapsulePreviewToken({ storeId: f!.store.id, editionId: edition.id }, new Date(), SECRET);
    const payload = await getPublicCapsuleEdition({ storeId: f!.store.id, segment: "3", token });
    // 40 papeles sin vender: caben los packs de 5 y 10.
    expect(payload!.packs.map((pack) => [pack.packSize, pack.available])).toEqual([[5, true], [10, true], [15, false], [20, false], [25, false], [30, false]]);
    expect(payload!.packs[1]).toMatchObject({ total: 124900, unitPrice: 12490, saving: 4100, giftLabel: "1 regalo sorpresa" });
    expect(payload!.day).toMatchObject({ cap: 5, opensAt: "08:00" });
  });

  it("con la venta encendida, una edición LIVE se ve sin enlace y una cerrada no se ve", async () => {
    const { edition } = await setup();
    await testPrisma.capsuleEdition.update({ where: { id: edition.id }, data: { status: CapsuleEditionStatus.LIVE } });
    await expect(getPublicCapsuleEdition({ storeId: f!.store.id, segment: "3", salesEnabled: true })).resolves.toMatchObject({ preview: false });
    await testPrisma.capsuleEdition.update({ where: { id: edition.id }, data: { status: CapsuleEditionStatus.CLOSED } });
    await expect(getPublicCapsuleEdition({ storeId: f!.store.id, segment: "3", salesEnabled: true })).resolves.toBeNull();
  });
});

describe("enlace de vista previa desde el panel", () => {
  it("la dueña lo crea para su edición; la cuenta de solo lectura no", async () => {
    const { edition } = await setup();
    const { POST } = await import("@/app/api/[storeId]/capsule-editions/[editionId]/preview-link/route");
    const params = { params: { storeId: f!.store.id, editionId: edition.id } };
    session.userId = f!.store.userId;
    session.claims = {};
    const response = await POST(new Request("https://admin.test/x", { method: "POST" }), params);
    expect(response.status).toBe(200);
    const { url } = await response.json();
    expect(url).toMatch(/\/capsulas\/3-escritorio\?vista=/);
    session.userId = "user_viewer_preview";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [f!.store.id] } };
    expect((await POST(new Request("https://admin.test/x", { method: "POST" }), params)).status).toBe(403);
  });
});

describe("cotizar un pack", () => {
  it("cuenta cada cápsula como el producto más grande de la bolsa, en caja", async () => {
    const { editionProduct, lapicero } = await setup();
    const large = await testPrisma.size.create({ data: { name: "Grande pesado", value: "L-P", storeId: f!.store.id } });
    await testPrisma.product.update({ where: { id: lapicero.id }, data: { sizeId: large.id } });
    const products = [{ id: editionProduct.id, name: editionProduct.name, size: null }];
    const pack = await capsulePackageFor(testPrisma, [{ productId: editionProduct.id, quantity: 5 }], products, {});
    expect(pack).toMatchObject({ type: "box", size: "L" });
    expect(pack!.weight).toBeGreaterThanOrEqual(1);
    await expect(capsulePackageFor(testPrisma, [{ productId: f!.component.id, quantity: 1 }], [{ id: f!.component.id, name: "c", size: null }], {})).resolves.toBeNull();
  });
});
