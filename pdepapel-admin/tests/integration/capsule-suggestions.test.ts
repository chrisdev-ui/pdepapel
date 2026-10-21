import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

import { GET as getBag } from "@/app/api/[storeId]/capsule-editions/[editionId]/suggested-bag/route";
import { POST as postFeedback } from "@/app/api/[storeId]/capsule-suggestions/feedback/route";
import { PUT as putLicense } from "@/app/api/[storeId]/capsule-suggestions/licenses/route";
import { GET as getSuggestions } from "@/app/api/[storeId]/capsule-suggestions/route";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Ediciones sugeridas de punta a punta contra MySQL: productos quietos de un
 * diseño, uno de licencia y uno barato; el ✗ de Paula, «Permitir en
 * cápsulas», la bolsa de una edición y la cuenta de solo lectura.
 */
let f: InventoryFixture | undefined;
const OLD = new Date(Date.now() - 400 * 86_400_000);

const req = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://admin.test${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function make(name: string, designId: string, acqPrice: number, stock = 6) {
  return testPrisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomBytes(4).toString("hex")}`,
      description: "x",
      stock,
      price: 12000,
      acqPrice,
      sku: `SUG-${randomBytes(4).toString("hex")}`,
      storeId: f!.store.id,
      categoryId: f!.category.id,
      colorId: f!.component.colorId,
      sizeId: f!.component.sizeId,
      designId,
      createdAt: OLD,
    },
  });
}

async function setup() {
  f = await createInventoryFixture();
  const store = f.store.id;
  await testPrisma.capsulePackTemplate.createMany({
    data: CAPSULE_PACK_PRICES.map((price) => ({ storeId: store, packSize: price.packSize, giftMaxCost: price.packSize >= 10 ? 2000 : 0, giftMaxItems: price.packSize >= 10 ? 1 : 0, boxReserveCost: 1500 })),
  });
  const kawaii = await testPrisma.design.create({ data: { name: `Kawaii ${randomBytes(3).toString("hex")}`, storeId: store } });
  const kawaiiIds: string[] = [];
  for (let i = 0; i < 12; i += 1) kawaiiIds.push((await make(`Libreta ${i}`, kawaii.id, 3200 + i * 150, 5 + (i % 3))).id);
  const licensed = await make("Cuaderno Hello Kitty", kawaii.id, 4000);
  const cheap = await make("Sticker suelto", kawaii.id, 1500, 20);
  for (let i = 0; i < 22; i += 1) await make(`Otro ${i}`, f.component.designId!, 9000 + i);
  session.userId = f.store.userId;
  session.claims = {};
  return { store, themeKey: `design:${kawaii.id}`, kawaiiIds, licensed, cheap };
}

const suggestions = async (store: string) => {
  const response = await getSuggestions(req(`/api/${store}/capsule-suggestions`), { params: { storeId: store } });
  expect(response.status).toBe(200);
  return response.json();
};

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.capsuleSuggestionFeedback.deleteMany({ where: { storeId: f.store.id } });
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

describe("ediciones sugeridas (MySQL)", () => {
  it("sugiere el tema con sus quietos; deja fuera la licencia pendiente y lo barato, que sale «para regalo»", async () => {
    const { store, themeKey, kawaiiIds, licensed, cheap } = await setup();
    await testPrisma.category.update({ where: { id: f!.category.id }, data: { name: "✏️ Agendas" } });
    const body = await suggestions(store);
    expect(body.suggestions[0].pitch).toContain(": agendas.");
    expect(JSON.stringify(body)).not.toContain("✏️");
    expect(body.packSource).toMatchObject({ source: "template" });
    expect(body.suggestions.map((s: { themeKey: string }) => s.themeKey)).toEqual([themeKey]);
    const [suggestion] = body.suggestions;
    const bagIds = suggestion.bag.map((line: { productId: string }) => line.productId);
    expect(bagIds.every((id: string) => kawaiiIds.includes(id))).toBe(true);
    expect(bagIds).not.toContain(licensed.id);
    expect(bagIds).not.toContain(cheap.id);
    expect(suggestion.packs.filter((pack: { available: boolean }) => pack.available).every((pack: { passes: boolean }) => pack.passes)).toBe(true);
    expect(body.licenses).toEqual([{ productId: licensed.id, name: "Cuaderno Hello Kitty", term: "hello kitty", allowed: false }]);
    const missing = body.missing.flatMap((group: { products: { productId: string; gift: boolean }[] }) => group.products);
    expect(missing.find((row: { productId: string }) => row.productId === cheap.id)).toMatchObject({ gift: true });
  });

  it("«Permitir en cápsulas» la deja entrar, y un ✗ al tema lo quita hasta un ✓", async () => {
    const { store, themeKey, licensed } = await setup();
    expect((await putLicense(req(`/api/${store}/capsule-suggestions/licenses`, "PUT", { productId: licensed.id, allowed: true }), { params: { storeId: store } })).status).toBe(200);
    const allowed = await suggestions(store);
    expect(allowed.suggestions[0].bag.map((line: { productId: string }) => line.productId)).toContain(licensed.id);
    expect(allowed.licenses[0]).toMatchObject({ allowed: true });

    const feedback = (decision: string, productId?: string) =>
      postFeedback(req(`/api/${store}/capsule-suggestions/feedback`, "POST", { themeKey, decision, productId }), { params: { storeId: store } });
    expect((await feedback("REJECTED")).status).toBe(201);
    expect((await suggestions(store)).suggestions).toEqual([]);
    expect((await feedback("ACCEPTED")).status).toBe(201);
    expect((await suggestions(store)).suggestions.map((s: { themeKey: string }) => s.themeKey)).toEqual([themeKey]);

    expect((await feedback("REJECTED", licensed.id)).status).toBe(201);
    expect((await suggestions(store)).suggestions[0].bag.map((line: { productId: string }) => line.productId)).not.toContain(licensed.id);
  });

  it("«Sugerir bolsa» en una edición: sus temas y una bolsa dentro de su banda", async () => {
    const { store, themeKey } = await setup();
    const editionProduct = await make("Edicion", f!.component.designId!, 0, 0);
    await testPrisma.product.update({ where: { id: editionProduct.id }, data: { isArchived: true, price: 12900 } });
    const edition = await testPrisma.capsuleEdition.create({ data: { storeId: store, number: 1, name: "Kawaii", theme: "kawaii", productId: editionProduct.id, costBandMin: 3000, costBandMax: 4000 } });
    const response = await getBag(req(`/api/${store}/capsule-editions/${edition.id}/suggested-bag?tema=${encodeURIComponent(themeKey)}`), { params: { storeId: store, editionId: edition.id } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.themes.map((theme: { key: string }) => theme.key)).toContain(themeKey);
    expect(body.bag.length).toBeGreaterThan(0);
    expect(body.bag.every((line: { unitCost: number }) => line.unitCost >= 3000 && line.unitCost <= 4000)).toBe(true);
  });

  it("la cuenta de solo lectura no ve sugerencias, ni bolsas, ni da ✓/✗, ni permite licencias", async () => {
    const { store, themeKey, licensed } = await setup();
    session.userId = "user_viewer_sugerencias";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [store] } };
    const responses = [
      await getSuggestions(req(`/api/${store}/capsule-suggestions`), { params: { storeId: store } }),
      await postFeedback(req(`/api/${store}/capsule-suggestions/feedback`, "POST", { themeKey, decision: "REJECTED" }), { params: { storeId: store } }),
      await putLicense(req(`/api/${store}/capsule-suggestions/licenses`, "PUT", { productId: licensed.id, allowed: true }), { params: { storeId: store } }),
      await getBag(req(`/api/${store}/capsule-editions/x/suggested-bag`), { params: { storeId: store, editionId: "x" } }),
    ];
    for (const response of responses) {
      expect([401, 403]).toContain(response.status);
      assertNoForbiddenKeys(await response.json(), "viewer");
    }
    expect(await testPrisma.capsuleSuggestionFeedback.count({ where: { storeId: store } })).toBe(0);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: licensed.id } })).capsuleLicenseAllowed).toBe(false);
  });
});
