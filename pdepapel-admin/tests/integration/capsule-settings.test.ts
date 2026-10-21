import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

import { GET, PUT } from "@/app/api/[storeId]/capsule-settings/route";
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

async function edition(number: number, createdAt: Date, gift: number | null) {
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
    data: { storeId: f!.store.id, number, name: `Edición ${number}`, theme: "x", productId: product.id, costBandMin: 3000, costBandMax: 5000, createdAt },
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

  it("rechaza una plantilla incompleta o un piso negativo", async () => {
    f = await createInventoryFixture();
    session.userId = f.store.userId;
    expect((await call("PUT", { minSlipCost: 3000, template: template(1000).slice(0, 2) })).status).toBe(400);
    expect((await call("PUT", { minSlipCost: -1 })).status).toBe(400);
    expect(await testPrisma.capsulePackTemplate.count({ where: { storeId: f.store.id } })).toBe(0);
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
