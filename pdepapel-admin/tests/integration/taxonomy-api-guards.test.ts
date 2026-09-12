/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getColor } from "@/app/(dashboard)/[storeId]/(routes)/colores/[colorId]/server/get-color";
import { getDesign } from "@/app/(dashboard)/[storeId]/(routes)/disenos/[designId]/server/get-design";
import { getSize } from "@/app/(dashboard)/[storeId]/(routes)/tamanos/[sizeId]/server/get-size";
import { getCategoryTypes } from "@/app/(dashboard)/[storeId]/(routes)/categorias/[categoryId]/server/get-category-types";
import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * Auditoría Grupo B (2026-09-11), reglas de la API de atributos:
 * - toda lectura o escritura por id va acotada a la tienda;
 * - nombres únicos sin distinguir mayúsculas ni tildes (409 en español);
 * - cada mutación invalida la caché de productos de la tienda;
 * - crear una subcategoría nunca llama a OpenAI: la portada se pide aparte.
 * Cada prueba llama al handler real contra la base local.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const mocks = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
  revalidate: vi.fn().mockResolvedValue(undefined),
  ensureAssets: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: mocks.invalidate,
  invalidateStorePromotionsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: mocks.revalidate,
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/category-covers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/category-covers")>()),
  isCategoryCoverConfigured: () => true,
  ensureCategoryAssets: mocks.ensureAssets,
}));

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://admin.papeleriapdepapel.com" },
    body: JSON.stringify(body),
  });
const get = () => new Request("http://admin.test/api/x", { headers: { Origin: "https://papeleriapdepapel.com" } });

describe("taxonomy API guards with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let otherStoreId: string | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidate.mockResolvedValue(undefined);
    mocks.revalidate.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    if (otherStoreId) {
      await testPrisma.color.deleteMany({ where: { storeId: otherStoreId } });
      await testPrisma.store.delete({ where: { id: otherStoreId } });
      otherStoreId = undefined;
    }
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function createOtherStore() {
    const store = await testPrisma.store.create({
      data: { name: `Otra tienda ${randomUUID()}`, userId: `other-user-${randomUUID()}` },
    });
    otherStoreId = store.id;
    return store;
  }

  it("rejects a color whose name only differs in case or accents with a Spanish 409", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { POST } = await import("@/app/api/[storeId]/colors/route");

    const response = await POST(json("POST", { name: "  ROSA ", value: "#ff00aa" }), {
      params: { storeId: fixture.store.id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Ya existe un color llamado «ROSA» en esta tienda." });
    expect(await testPrisma.color.count({ where: { storeId: fixture.store.id } })).toBe(1);
    expect(mocks.invalidate).not.toHaveBeenCalled();

    const accented = await POST(json("POST", { name: "Rosá", value: "#ff00ab" }), {
      params: { storeId: fixture.store.id },
    });
    expect(accented.status).toBe(409);

    const created = await POST(json("POST", { name: "  Verde   menta ", value: "#00ffaa" }), {
      params: { storeId: fixture.store.id },
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ name: "Verde menta", value: "#00ffaa" });
    expect(mocks.invalidate).toHaveBeenCalledWith(fixture.store.id);
  });

  it("keeps the unique index as the last barrier (P2002) behind the pre-check", async () => {
    fixture = await createInventoryFixture();
    await expect(
      testPrisma.color.create({ data: { name: "Rosa", value: "#000000", storeId: fixture.store.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      testPrisma.design.create({ data: { name: "Kawaii", storeId: fixture.store.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("refuses to rename a design to an existing name and keeps the row", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const second = await testPrisma.design.create({ data: { name: "Osito", storeId: fixture.store.id } });
    const { PATCH } = await import("@/app/api/[storeId]/designs/[designId]/route");

    const response = await PATCH(json("PATCH", { name: "kawaii" }), {
      params: { storeId: fixture.store.id, designId: second.id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Ya existe un diseño llamado «kawaii» en esta tienda." });
    expect((await testPrisma.design.findUniqueOrThrow({ where: { id: second.id } })).name).toBe("Osito");
    expect(mocks.invalidate).not.toHaveBeenCalled();

    // Renaming to itself with different case is allowed: it is the same row.
    const same = await PATCH(json("PATCH", { name: "OSITO" }), {
      params: { storeId: fixture.store.id, designId: second.id },
    });
    expect(same.status).toBe(200);
    expect(await same.json()).toMatchObject({ id: second.id, name: "OSITO" });
    expect(mocks.invalidate).toHaveBeenCalledWith(fixture.store.id);
  });

  it("creates a subcategory without calling the cover generator; the cover endpoint does", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const type = await testPrisma.type.findFirstOrThrow({ where: { storeId: fixture.store.id } });
    const { POST } = await import("@/app/api/[storeId]/categories/route");

    const response = await POST(json("POST", { name: "Stickers", typeId: type.id }), {
      params: { storeId: fixture.store.id },
    });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({ name: "Stickers", typeId: type.id, imageUrl: null, seoIntro: null });
    expect(created).not.toHaveProperty("assetsWarning");
    expect(mocks.ensureAssets).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledWith(fixture.store.id);
    expect(mocks.revalidate).toHaveBeenCalledWith(
      expect.objectContaining({ paths: expect.arrayContaining([`/categoria/${created.slug}`]) }),
    );

    // Same name inside the same category → 409, whatever the case.
    const duplicate = await POST(json("POST", { name: "stickers", typeId: type.id }), {
      params: { storeId: fixture.store.id },
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: "Ya existe una subcategoría llamada «stickers» en esta categoría." });

    mocks.ensureAssets.mockResolvedValue({ imageUrl: null, seoIntro: "Intro generada", generated: ["seoIntro"] });
    const { POST: COVER } = await import("@/app/api/[storeId]/categories/[categoryId]/cover/route");
    const cover = await COVER(json("POST", { part: "intro" }), {
      params: { storeId: fixture.store.id, categoryId: created.id },
    });
    expect(cover.status).toBe(200);
    expect(await cover.json()).toMatchObject({ seoIntro: "Intro generada", generated: ["seoIntro"] });
    expect(mocks.ensureAssets).toHaveBeenCalledWith(fixture.store.id, created.id, { force: false, part: "intro" });

    const badPart = await COVER(json("POST", { part: "logo" }), {
      params: { storeId: fixture.store.id, categoryId: created.id },
    });
    expect(badPart.status).toBe(400);

    // Anonymous callers and other stores' ids never reach the generator.
    session.userId = null;
    const anonymous = await COVER(json("POST", {}), { params: { storeId: fixture.store.id, categoryId: created.id } });
    expect(anonymous.status).toBe(401);
    session.userId = fixture.store.userId;
    const foreign = await COVER(json("POST", {}), { params: { storeId: fixture.store.id, categoryId: "no-existe" } });
    expect(foreign.status).toBe(404);
    expect(mocks.ensureAssets).toHaveBeenCalledTimes(1);
  });

  it("renames a size and invalidates the store products cache", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const size = await testPrisma.size.findFirstOrThrow({ where: { storeId: fixture.store.id } });
    const { PATCH } = await import("@/app/api/[storeId]/sizes/[sizeId]/route");

    const response = await PATCH(json("PATCH", { name: "Pequeñito", value: size.value }), {
      params: { storeId: fixture.store.id, sizeId: size.id },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: size.id, name: "Pequeñito" });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith(fixture.store.id);
  });

  it("scopes the detail loaders by store and returns null for another store's row", async () => {
    fixture = await createInventoryFixture();
    const other = await createOtherStore();
    const [size, color, design] = await Promise.all([
      testPrisma.size.findFirstOrThrow({ where: { storeId: fixture.store.id } }),
      testPrisma.color.findFirstOrThrow({ where: { storeId: fixture.store.id } }),
      testPrisma.design.findFirstOrThrow({ where: { storeId: fixture.store.id } }),
    ]);

    expect((await getSize(fixture.store.id, size.id))?.id).toBe(size.id);
    expect((await getColor(fixture.store.id, color.id))?.id).toBe(color.id);
    expect((await getDesign(fixture.store.id, design.id))?.id).toBe(design.id);
    expect((await getCategoryTypes(fixture.store.id, fixture.category.id)).category?.id).toBe(fixture.category.id);

    expect(await getSize(other.id, size.id)).toBeNull();
    expect(await getColor(other.id, color.id)).toBeNull();
    expect(await getDesign(other.id, design.id)).toBeNull();
    const foreign = await getCategoryTypes(other.id, fixture.category.id);
    expect(foreign.category).toBeNull();
    expect(foreign.types).toEqual([]);
  });

  it("answers 404 for a color of another store and refuses to edit it", async () => {
    fixture = await createInventoryFixture();
    const other = await createOtherStore();
    const color = await testPrisma.color.findFirstOrThrow({ where: { storeId: fixture.store.id } });
    const { GET, PATCH, DELETE } = await import("@/app/api/[storeId]/colors/[colorId]/route");

    const own = await GET(get(), { params: { storeId: fixture.store.id, colorId: color.id } });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ id: color.id, name: "Rosa", value: color.value });

    const foreign = await GET(get(), { params: { storeId: other.id, colorId: color.id } });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toMatchObject({ error: "El color no existe en esta tienda." });

    session.userId = other.userId;
    const patched = await PATCH(json("PATCH", { name: "Robado", value: "#123456" }), {
      params: { storeId: other.id, colorId: color.id },
    });
    expect(patched.status).toBe(404);
    const deleted = await DELETE(get(), { params: { storeId: other.id, colorId: color.id } });
    expect(deleted.status).toBe(404);
    expect((await testPrisma.color.findUniqueOrThrow({ where: { id: color.id } })).name).toBe("Rosa");
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
