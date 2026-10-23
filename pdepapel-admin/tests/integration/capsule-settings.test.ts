import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

import { GET, PUT } from "@/app/api/[storeId]/capsule-settings/route";
import { resolveCapsuleFloor } from "@/lib/capsule-floor";
import { resolveSuggestionPackOptions } from "@/lib/capsule-settings";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Ajustes de las ediciones sugeridas: los packs salen de la edición más
 * reciente con packs; sin ella, de la plantilla; sin ninguna, no hay
 * sugerencias. Solo la dueña los lee o los cambia.
 */
let f: InventoryFixture | undefined;

const template = (gift: number) => CAPSULE_PACK_PRICES.map((price) => ({ packSize: price.packSize, giftMaxCost: gift, giftMaxItems: gift ? 1 : 0, giftLabel: null, boxReserveCost: 1500 }));
const call = (method: "GET" | "PUT", body?: unknown) => {
  const req = new Request(`http://admin.test/api/${f!.store.id}/capsule-settings`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return (method === "GET" ? GET : PUT)(req, { params: { storeId: f!.store.id } });
};

async function edition(number: number, createdAt: Date, gift: number | null, minMarginPct: number | null = null) {
  const product = await testPrisma.product.create({
    data: {
      name: `Edicion ${number}`,
      slug: `edicion-${randomBytes(4).toString("hex")}`,
      description: "x",
      stock: 0,
      price: 12900,
      sku: `ED-${randomBytes(4).toString("hex")}`,
      storeId: f!.store.id,
      categoryId: f!.category.id,
      colorId: f!.component.colorId,
      sizeId: f!.component.sizeId,
      designId: f!.component.designId,
      isArchived: true,
    },
  });
  const row = await testPrisma.capsuleEdition.create({
    data: { storeId: f!.store.id, number, name: `Edición ${number}`, theme: "x", productId: product.id, costBandMin: 3000, costBandMax: 5000, createdAt, minMarginPct },
  });
  if (gift !== null) {
    await testPrisma.capsulePackOption.createMany({ data: template(gift).map(({ giftLabel: _label, ...option }) => ({ editionId: row.id, ...option })) });
  }
  return row;
}

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.capsulePackTemplate.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
  session.userId = null;
  session.claims = {};
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("packs de las sugerencias", () => {
  it("sin edición con packs ni plantilla no hay fuente; con plantilla, la plantilla; con edición, la más reciente con packs", async () => {
    f = await createInventoryFixture();
    expect(await resolveSuggestionPackOptions(f.store.id)).toBeNull();

    session.userId = f.store.userId;
    const saved = await call("PUT", { minSlipCost: 3000, template: template(2500) });
    expect(saved.status).toBe(200);
    expect(await resolveSuggestionPackOptions(f.store.id)).toMatchObject({ source: "template", edition: null });

    await edition(1, new Date("2026-10-01T00:00:00Z"), 1000);
    await edition(2, new Date("2026-10-10T00:00:00Z"), 1800);
    await edition(3, new Date("2026-10-20T00:00:00Z"), null);
    const active = await resolveSuggestionPackOptions(f.store.id);
    expect(active).toMatchObject({ source: "edition", edition: { number: 2 } });
    expect(active!.options.map((option) => option.giftMaxCost)).toEqual(CAPSULE_PACK_PRICES.map(() => 1800));
    expect((await testPrisma.store.findUniqueOrThrow({ where: { id: f.store.id } })).capsuleMinSlipCost).toBe(3000);
  });

  it("el piso de cápsulas: la edición más reciente si lo tiene, luego el de cápsulas, luego el de la tienda", async () => {
    f = await createInventoryFixture();
    const store = f.store.id;
    await testPrisma.store.update({ where: { id: store }, data: { storeMinMarginPercent: 35, capsuleMinMarginPct: null } });
    expect(await resolveCapsuleFloor(store)).toMatchObject({ value: 35, source: "store" });

    session.userId = f.store.userId;
    expect((await call("PUT", { minSlipCost: 3000, minMarginPct: 50 })).status).toBe(200);
    expect(await resolveCapsuleFloor(store)).toMatchObject({ value: 50, source: "capsules" });

    await edition(1, new Date("2026-10-01T00:00:00Z"), null, 60);
    expect(await resolveCapsuleFloor(store)).toMatchObject({ value: 60, source: "edition", edition: { number: 1 } });
    // Una edición más nueva sin piso propio: manda el de cápsulas, no el de la anterior.
    await edition(2, new Date("2026-10-10T00:00:00Z"), null, null);
    expect(await resolveCapsuleFloor(store)).toMatchObject({ value: 50, source: "capsules" });
    // En el taller manda la edición que se arma, aunque no tenga piso.
    expect(await resolveCapsuleFloor(store, { minMarginPct: 55 })).toMatchObject({ value: 55, source: "edition" });
    expect(await resolveCapsuleFloor(store, { minMarginPct: null })).toMatchObject({ value: 50, source: "capsules" });
    expect((await (await call("GET")).json()).minMarginPct).toBe(50);
  });

  it("rechaza una plantilla incompleta o un piso negativo", async () => {
    f = await createInventoryFixture();
    session.userId = f.store.userId;
    expect((await call("PUT", { minSlipCost: 3000, template: template(1000).slice(0, 2) })).status).toBe(400);
    expect((await call("PUT", { minSlipCost: -1 })).status).toBe(400);
    expect((await call("PUT", { minSlipCost: 3000, minMarginPct: 95 })).status).toBe(400);
    expect(await testPrisma.capsulePackTemplate.count({ where: { storeId: f.store.id } })).toBe(0);
  });

  it("un cuerpo vacío o roto da 400 y no borra los mínimos; un campo que no viene se deja como está", async () => {
    f = await createInventoryFixture();
    session.userId = f.store.userId;
    expect((await call("PUT", { minSlipCost: 3500, minMarginPct: 50 })).status).toBe(200);
    const minimums = async () => testPrisma.store.findUniqueOrThrow({ where: { id: f!.store.id }, select: { capsuleMinSlipCost: true, capsuleMinMarginPct: true } });
    const raw = (body: string | undefined, headers: Record<string, string> = { "content-type": "application/json" }) =>
      PUT(new Request(`http://admin.test/api/${f!.store.id}/capsule-settings`, { method: "PUT", headers, body }), { params: { storeId: f!.store.id } });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const response of [await raw(undefined), await raw(""), await raw('{"minMarginPct": 4'), await raw("null"), await raw("[]"), await raw("50", { "content-type": "text/plain" })]) {
      expect(response.status).toBe(400);
      expect((await response.json()).error ?? "").toMatch(/No llegaron los ajustes de cápsulas/);
    }
    expect(warn).toHaveBeenCalledWith("[CAPSULE_SETTINGS_PUT] cuerpo ilegible", expect.objectContaining({ method: "PUT" }));
    warn.mockRestore();
    expect(await minimums()).toEqual({ capsuleMinSlipCost: 3500, capsuleMinMarginPct: 50 });

    expect((await call("PUT", {})).status).toBe(200);
    expect((await call("PUT", { minSlipCost: 4000 })).status).toBe(200);
    expect(await minimums()).toEqual({ capsuleMinSlipCost: 4000, capsuleMinMarginPct: 50 });
    // Vaciar el campo en el panel manda null: eso sí lo borra.
    expect((await call("PUT", { minMarginPct: null })).status).toBe(200);
    expect(await minimums()).toEqual({ capsuleMinSlipCost: 4000, capsuleMinMarginPct: null });
  });

  it("la caja de cada pack necesita costo o «Sin caja»; el regalo en 0 vale; sin plantilla completa no hay sugerencias", async () => {
    f = await createInventoryFixture();
    session.userId = f.store.userId;
    const sizes = CAPSULE_PACK_PRICES.map((price) => price.packSize);
    const row = (packSize: number, box: unknown, noBox?: boolean) => ({ packSize, giftMaxCost: 0, giftMaxItems: 0, giftLabel: "", boxReserveCost: box, ...(noBox === undefined ? {} : { noBox }) });

    for (const box of [null, "", 0, undefined]) {
      const response = await call("PUT", { template: sizes.map((size, index) => row(size, index === 0 ? box : 1500)) });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(`Falta el costo de la caja del pack de ${sizes[0]}: escríbelo o marca «Sin caja»`);
    }
    expect(await testPrisma.capsulePackTemplate.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await resolveSuggestionPackOptions(f.store.id)).toBeNull();

    // Regalos en 0 y una caja marcada «Sin caja»: se guarda, y la caja queda en 0 a propósito.
    const saved = await call("PUT", { template: sizes.map((size, index) => (index === 0 ? row(size, null, true) : row(size, 1500))) });
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.template.find((item: { packSize: number }) => item.packSize === sizes[0])).toMatchObject({ boxReserveCost: 0, noBox: true, giftMaxCost: 0 });
    expect(body.template.find((item: { packSize: number }) => item.packSize === sizes[1])).toMatchObject({ boxReserveCost: 1500, noBox: false });
    expect(await resolveSuggestionPackOptions(f.store.id)).toMatchObject({ source: "template" });

    // Guardar solo el margen después no toca la plantilla.
    expect((await call("PUT", { minMarginPct: 50 })).status).toBe(200);
    expect(await testPrisma.capsulePackTemplate.count({ where: { storeId: f.store.id } })).toBe(sizes.length);
  });

  it("la cuenta de solo lectura no los lee ni los cambia", async () => {
    f = await createInventoryFixture();
    session.userId = "user_viewer_capsulas";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [f.store.id] } };
    for (const response of [await call("GET"), await call("PUT", { minSlipCost: 1 })]) {
      expect([401, 403]).toContain(response.status);
      assertNoForbiddenKeys(await response.json(), "viewer");
    }
    expect((await testPrisma.store.findUniqueOrThrow({ where: { id: f.store.id } })).capsuleMinSlipCost).toBe(3000);
  });
});
