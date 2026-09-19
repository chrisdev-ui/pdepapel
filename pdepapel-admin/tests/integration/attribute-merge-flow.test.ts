import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { mergeAttributes, moveCategoriesToType, previewAttributeMerge } from "@/lib/attribute-merge";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/**
 * «Unir con…» (auditoría de Atributos): los productos pasan al destino, las
 * fuentes quedan archivadas, la regla de colisión de los grupos se comprueba
 * antes de escribir y las subcategorías conservan sus URL como alias.
 */
describe("attribute merge flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let other: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    for (const f of [fixture, other]) {
      if (!f) continue;
      await testPrisma.offerCategory.deleteMany({ where: { category: { storeId: f.store.id } } });
      await testPrisma.offer.deleteMany({ where: { storeId: f.store.id } });
      await testPrisma.categorySlugAlias.deleteMany({ where: { storeId: f.store.id } });
      await testPrisma.product.deleteMany({ where: { storeId: f.store.id, id: { notIn: [f.component.id, f.kit.id] } } });
      await testPrisma.productGroup.deleteMany({ where: { storeId: f.store.id } });
      await deleteInventoryFixture(f);
    }
    fixture = undefined;
    other = undefined;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("moves the products to the target, archives the source and reports the counts", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const rosado = await testPrisma.color.findFirstOrThrow({ where: { storeId } });
    const rosaPastel = await testPrisma.color.create({ data: { storeId, name: "Rosa pastel", value: "#F9C5D1" } });
    await testPrisma.product.update({ where: { id: fixture.kit.id }, data: { colorId: rosaPastel.id, isArchived: true } });

    const preview = await previewAttributeMerge(testPrisma, { storeId, input: { kind: "colors", sourceIds: [rosaPastel.id], targetId: rosado.id } });
    expect(preview).toMatchObject({ products: { active: 0, archived: 1 }, groups: 0, collisions: [], target: { name: "Rosa", products: 1 } });

    const result = await testPrisma.$transaction((tx) =>
      mergeAttributes(tx, { storeId, input: { kind: "colors", sourceIds: [rosaPastel.id], targetId: rosado.id } }),
    );
    expect(result.moved).toBe(1);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } })).resolves.toMatchObject({ colorId: rosado.id, sku: expect.stringContaining("TEST-") });
    await expect(testPrisma.color.findUniqueOrThrow({ where: { id: rosaPastel.id } })).resolves.toMatchObject({ isArchived: true });
    await expect(testPrisma.color.findUniqueOrThrow({ where: { id: rosado.id } })).resolves.toMatchObject({ isArchived: false });
  });

  it("refuses when a group would end up with two identical variants and changes nothing", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    const otherColor = await testPrisma.color.create({ data: { storeId, name: "Rosa pastel", value: "#F9C5D1" } });
    const group = await testPrisma.productGroup.create({ data: { storeId, name: "Llaveros Osito", description: "Grupo de pruebas" } });
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { productGroupId: group.id } });
    const sibling = await testPrisma.product.create({
      data: {
        name: "Llavero panda",
        slug: `llavero-panda-${storeId}`,
        description: "x",
        stock: 1,
        price: 1000,
        acqPrice: 500,
        sku: `TEST-${storeId}-panda`,
        storeId,
        categoryId: base.categoryId,
        sizeId: base.sizeId,
        designId: base.designId,
        colorId: otherColor.id,
        productGroupId: group.id,
      },
    });

    const input = { kind: "colors" as const, sourceIds: [otherColor.id], targetId: base.colorId };
    const preview = await previewAttributeMerge(testPrisma, { storeId, input });
    expect(preview.groups).toBe(1);
    expect(preview.collisions).toEqual([
      { groupId: group.id, groupName: "Llaveros Osito", variants: [{ id: fixture.component.id, name: "Componente" }, { id: sibling.id, name: "Llavero panda" }] },
    ]);

    await expect(testPrisma.$transaction((tx) => mergeAttributes(tx, { storeId, input }))).rejects.toThrow(/quedarían dos variantes iguales/);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: sibling.id } })).resolves.toMatchObject({ colorId: otherColor.id });
    await expect(testPrisma.color.findUniqueOrThrow({ where: { id: otherColor.id } })).resolves.toMatchObject({ isArchived: false });

    // Through the route: 409 with the collisions in the body, and a dry run answers the preview.
    session.userId = fixture.store.userId;
    const { POST } = await import("@/app/api/[storeId]/attributes/merge/route");
    const dry = await POST(json("POST", { ...input, dryRun: true }), { params: { storeId } });
    expect(dry.status).toBe(200);
    expect((await dry.json()).collisions).toHaveLength(1);
    const blocked = await POST(json("POST", input), { params: { storeId } });
    expect(blocked.status).toBe(409);
  });

  it("merges a subcategory carrying its offers and leaving its URL as an alias, and never across stores", async () => {
    fixture = await createInventoryFixture();
    other = await createInventoryFixture();
    const storeId = fixture.store.id;
    const type = await testPrisma.type.findFirstOrThrow({ where: { storeId } });
    const target = fixture.category;
    const source = await testPrisma.category.create({ data: { storeId, typeId: type.id, name: "Cinta", slug: `cinta-${storeId}` } });
    await testPrisma.categorySlugAlias.create({ data: { storeId, categoryId: source.id, slug: `cintas-${storeId}` } });
    await testPrisma.product.update({ where: { id: fixture.kit.id }, data: { categoryId: source.id } });
    const offer = await testPrisma.offer.create({
      data: { storeId, name: "Oferta cintas", type: "PERCENTAGE", amount: 10, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
    });
    await testPrisma.offerCategory.create({ data: { offerId: offer.id, categoryId: source.id } });
    await testPrisma.offerCategory.create({ data: { offerId: offer.id, categoryId: target.id } });

    const input = { kind: "categories" as const, sourceIds: [source.id], targetId: target.id };
    const preview = await previewAttributeMerge(testPrisma, { storeId, input });
    expect(preview).toMatchObject({ offers: 1, aliases: 1, crossType: false, products: { active: 1, archived: 0 } });

    const result = await testPrisma.$transaction((tx) => mergeAttributes(tx, { storeId, input }));
    expect(result.moved).toBe(1);
    expect(result.categorySlugs).toEqual([source.slug, target.slug]);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } })).resolves.toMatchObject({ categoryId: target.id });
    await expect(testPrisma.category.findUniqueOrThrow({ where: { id: source.id } })).resolves.toMatchObject({ isArchived: true });
    // The offer keeps one row for the target (no duplicate pair) and none for the source.
    await expect(testPrisma.offerCategory.findMany({ where: { offerId: offer.id } })).resolves.toEqual([expect.objectContaining({ categoryId: target.id })]);
    // The old alias now points at the target; the source slug itself stays with the archived row, so no alias is created for it.
    await expect(testPrisma.categorySlugAlias.findMany({ where: { storeId }, orderBy: { slug: "asc" } })).resolves.toEqual([
      expect.objectContaining({ slug: `cintas-${storeId}`, categoryId: target.id }),
    ]);

    // A target from another store is invisible: 404 through the library.
    await expect(
      previewAttributeMerge(testPrisma, { storeId, input: { kind: "categories", sourceIds: [target.id], targetId: other.category.id } }),
    ).rejects.toThrow(/no existe en esta tienda/);
  });

  it("moves subcategories to another category of the same store only", async () => {
    fixture = await createInventoryFixture();
    other = await createInventoryFixture();
    const storeId = fixture.store.id;
    const destination = await testPrisma.type.create({ data: { storeId, name: "Oficina", slug: `oficina-${storeId}` } });

    const moved = await moveCategoriesToType(testPrisma, { storeId, input: { ids: [fixture.category.id], typeId: destination.id } });
    expect(moved).toMatchObject({ count: 1, typeName: "Oficina", categorySlugs: [fixture.category.slug] });
    await expect(testPrisma.category.findUniqueOrThrow({ where: { id: fixture.category.id } })).resolves.toMatchObject({ typeId: destination.id });

    const foreignType = await testPrisma.type.findFirstOrThrow({ where: { storeId: other.store.id } });
    await expect(moveCategoriesToType(testPrisma, { storeId, input: { ids: [fixture.category.id], typeId: foreignType.id } })).rejects.toThrow(/no existe en esta tienda/);
    await expect(moveCategoriesToType(testPrisma, { storeId, input: { ids: [other.category.id], typeId: destination.id } })).rejects.toThrow(/no existen en esta tienda/);
  });
});
