import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

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
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: vi.fn() }));

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const photo = (name: string) => `https://res.cloudinary.com/test/image/upload/v1/${name}-${randomUUID().slice(0, 6)}.jpg`;

type Ctx = {
  f: InventoryFixture;
  colorA: { id: string };
  colorB: { id: string };
  design1: { id: string };
  design2: { id: string };
  groupId: string;
  /** vA1: color A + diseño 1, con una foto propia. vB1: color B + diseño 1. vA2: color A + diseño 2. */
  ids: { vA1: string; vB1: string; vA2: string };
  own: string;
  g1: string;
  g2: string;
};

describe("group photos reach every variant they apply to (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let connectionId: string | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      const storeId = fixture.store.id;
      if (connectionId) {
        await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { connectionId } });
        await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
        await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
        connectionId = undefined;
      }
      await testPrisma.image.deleteMany({ where: { OR: [{ product: { storeId } }, { productGroup: { storeId } }] } });
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId } });
      await testPrisma.inventoryMovement.deleteMany({ where: { storeId } });
      await testPrisma.product.updateMany({ where: { storeId }, data: { productGroupId: null } });
      await testPrisma.product.deleteMany({ where: { storeId, id: { notIn: [fixture.component.id, fixture.kit.id] } } });
      await testPrisma.productGroup.deleteMany({ where: { storeId } });
      await testPrisma.color.deleteMany({ where: { storeId, name: { startsWith: "Prop" } } });
      await testPrisma.design.deleteMany({ where: { storeId, name: { startsWith: "Prop" } } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const gallery = async (productId: string) =>
    testPrisma.image.findMany({
      where: { productId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { url: true, isMain: true, origin: true },
    });
  const covers = async (productId: string) => (await gallery(productId)).filter((image) => image.isMain).map((image) => image.url);
  const urls = async (productId: string) => (await gallery(productId)).map((image) => image.url);

  const variantRow = (ctx: Ctx, key: keyof Ctx["ids"], images: string[] = []) => {
    const colorId = key === "vB1" ? ctx.colorB.id : ctx.colorA.id;
    const designId = key === "vA2" ? ctx.design2.id : ctx.design1.id;
    return { id: ctx.ids[key], sizeId: ctx.f.component.sizeId, colorId, designId, images };
  };

  /** g1 es portada en «Todas»; vA1 tiene `own` como propia. */
  async function setup(): Promise<Ctx> {
    const f = await createInventoryFixture();
    fixture = f;
    session.userId = f.store.userId;
    const s = randomUUID().slice(0, 6);
    const colorA = await testPrisma.color.create({ data: { name: `Prop A ${s}`, value: `#11111${s.slice(0, 1)}`, storeId: f.store.id } });
    const colorB = await testPrisma.color.create({ data: { name: `Prop B ${s}`, value: `#22222${s.slice(0, 1)}`, storeId: f.store.id } });
    const design1 = { id: f.component.designId! };
    const design2 = await testPrisma.design.create({ data: { name: `Prop D2 ${s}`, storeId: f.store.id } });
    const own = photo("propia");
    const g1 = photo("g1");
    const g2 = photo("g2");
    const { POST } = await import("@/app/api/[storeId]/product-groups/route");
    const response = await POST(
      json("POST", {
        name: `Grupo fotos ${s}`,
        description: "",
        categoryId: f.category.id,
        defaultPrice: 12000,
        defaultCost: 5000,
        images: [{ url: own, isMain: false }, { url: g1, isMain: true }],
        imageMapping: [
          { url: own, scope: `COMBO|${colorA.id}|${design1.id}` },
          { url: g1, scope: "all" },
        ],
        variants: [
          { sizeId: f.component.sizeId, colorId: colorA.id, designId: design1.id, sku: `VA1-${s}`, images: [own] },
          { sizeId: f.component.sizeId, colorId: colorB.id, designId: design1.id, sku: `VB1-${s}`, images: [] },
          { sizeId: f.component.sizeId, colorId: colorA.id, designId: design2.id, sku: `VA2-${s}`, images: [] },
        ],
      }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    const group = await testPrisma.productGroup.findFirstOrThrow({ where: { storeId: f.store.id }, include: { products: true } });
    const bySku = (prefix: string) => group.products.find((p) => p.sku.startsWith(prefix))!.id;
    return { f, colorA, colorB, design1, design2: { id: design2.id }, groupId: group.id, ids: { vA1: bySku("VA1"), vB1: bySku("VB1"), vA2: bySku("VA2") }, own, g1, g2 };
  }

  async function patchGroup(ctx: Ctx, images: { url: string; isMain?: boolean }[], imageMapping: { url: string; scope: string }[], variantImages: Partial<Record<keyof Ctx["ids"], string[]>> = { vA1: [ctx.own] }) {
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const response = await PATCH(
      json("PATCH", {
        name: "Grupo fotos",
        description: "",
        categoryId: ctx.f.category.id,
        images,
        imageMapping,
        preserveSlug: true,
        confirmRemovals: true,
        variants: (["vA1", "vB1", "vA2"] as const).map((key) => variantRow(ctx, key, variantImages[key] ?? [])),
      }),
      { params: { storeId: ctx.f.store.id, productGroupId: ctx.groupId } },
    );
    expect(response.status).toBe(200);
  }

  it("a new «Todas» photo reaches the existing variants: own photos first, the variant keeps its own cover, one cover each", async () => {
    const ctx = await setup();
    const mapping = [
      { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
      { url: ctx.g1, scope: "all" },
      { url: ctx.g2, scope: "all" },
    ];
    await patchGroup(ctx, [{ url: ctx.own }, { url: ctx.g1, isMain: true }, { url: ctx.g2 }], mapping);

    expect(await urls(ctx.ids.vA1)).toEqual([ctx.own, ctx.g1, ctx.g2]);
    expect(await covers(ctx.ids.vA1)).toEqual([ctx.own]);
    expect((await gallery(ctx.ids.vA1)).map((image) => image.origin)).toEqual(["OWN", "GROUP_COPY", "GROUP_COPY"]);
    for (const id of [ctx.ids.vB1, ctx.ids.vA2]) {
      expect(await urls(id)).toEqual([ctx.g1, ctx.g2]);
      expect(await covers(id)).toEqual([ctx.g1]);
    }
    const groupRows = await testPrisma.image.findMany({ where: { productGroupId: ctx.groupId }, select: { url: true, scope: true } });
    expect(Object.fromEntries(groupRows.map((row) => [row.url, row.scope]))).toEqual({
      [ctx.own]: `COMBO|${ctx.colorA.id}|${ctx.design1.id}`,
      [ctx.g1]: "all",
      [ctx.g2]: "all",
    });
  });

  it("with several group covers, a variant without own photos gets only the first one as cover", async () => {
    const ctx = await setup();
    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g2, isMain: true }, { url: ctx.g1, isMain: true }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g2, scope: "all" },
        { url: ctx.g1, scope: "all" },
      ],
    );
    expect(await covers(ctx.ids.vB1)).toHaveLength(1);
    // vB1 ya tenía g1 de portada (del alta) y sigue en la galería: no cambia sola.
    expect(await covers(ctx.ids.vB1)).toEqual([ctx.g1]);
    expect(await covers(ctx.ids.vA1)).toEqual([ctx.own]);
  });

  it("color, design and combination scopes also reach existing variants with own photos", async () => {
    const ctx = await setup();
    const color = photo("color-a");
    const design = photo("diseno-2");
    const combo = photo("combo-b1");
    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g1, isMain: true }, { url: color }, { url: design }, { url: combo }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g1, scope: "all" },
        { url: color, scope: `COLOR|${ctx.colorA.id}` },
        { url: design, scope: `DESIGN|${ctx.design2.id}` },
        { url: combo, scope: `COMBO|${ctx.colorB.id}|${ctx.design1.id}` },
      ],
    );
    expect(await urls(ctx.ids.vA1)).toEqual([ctx.own, ctx.g1, color]);
    expect(await urls(ctx.ids.vA2)).toEqual([ctx.g1, color, design]);
    expect(await urls(ctx.ids.vB1)).toEqual([ctx.g1, combo]);
  });

  it("removing a group photo removes only the copies; an explicit own pick stays; the cover falls back to the next photo", async () => {
    const ctx = await setup();
    // vA2 elige g1 como propia; vB1 la tiene solo como copia (y es su portada).
    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g1, isMain: true }, { url: ctx.g2 }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g1, scope: "all" },
        { url: ctx.g2, scope: "all" },
      ],
      { vA1: [ctx.own], vA2: [ctx.g1] },
    );
    expect(await covers(ctx.ids.vB1)).toEqual([ctx.g1]);

    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g2 }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g2, scope: "all" },
      ],
      { vA1: [ctx.own], vA2: [ctx.g1] },
    );
    expect(await urls(ctx.ids.vB1)).toEqual([ctx.g2]);
    expect(await covers(ctx.ids.vB1)).toEqual([ctx.g2]);
    expect(await urls(ctx.ids.vA2)).toEqual([ctx.g1, ctx.g2]);
    expect((await gallery(ctx.ids.vA2))[0]).toMatchObject({ url: ctx.g1, origin: "OWN" });
    expect(await urls(ctx.ids.vA1)).toEqual([ctx.own, ctx.g2]);
  });

  it("rescoping a «Todas» photo to one color keeps it only on that color's variants", async () => {
    const ctx = await setup();
    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g1, isMain: true }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g1, scope: `COLOR|${ctx.colorA.id}` },
      ],
    );
    expect(await urls(ctx.ids.vA1)).toEqual([ctx.own, ctx.g1]);
    expect(await urls(ctx.ids.vA2)).toEqual([ctx.g1]);
    expect(await urls(ctx.ids.vB1)).toEqual([]);
  });

  it("rows with no origin (before the backfill) count as own: never removed, never duplicated", async () => {
    const ctx = await setup();
    // Como quedaron las filas antes del cambio: copias sin marcar.
    await testPrisma.image.updateMany({ where: { productId: { in: Object.values(ctx.ids) } }, data: { origin: null } });

    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g1, isMain: true }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g1, scope: "all" },
      ],
      // Lo que manda el formulario: las filas sin marcar viajan como propias.
      { vA1: [ctx.own, ctx.g1], vB1: [ctx.g1], vA2: [ctx.g1] },
    );
    expect(await urls(ctx.ids.vB1)).toEqual([ctx.g1]);

    await patchGroup(
      ctx,
      [{ url: ctx.own }],
      [{ url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` }],
      { vA1: [ctx.own, ctx.g1], vB1: [ctx.g1], vA2: [ctx.g1] },
    );
    expect(await urls(ctx.ids.vB1)).toEqual([ctx.g1]);
    expect((await gallery(ctx.ids.vB1))[0].origin).toBeNull();
    expect(await urls(ctx.ids.vA1)).toEqual([ctx.own, ctx.g1]);
  });

  it("rows with no origin sort exactly like own photos (by date), and group copies stay after both", async () => {
    const ctx = await setup();
    const older = photo("propia-vieja");
    const newer = photo("sin-origen-nueva");
    await testPrisma.image.createMany({
      data: [
        { productId: ctx.ids.vB1, url: older, origin: "OWN", createdAt: new Date("2026-01-01T00:00:00Z") },
        { productId: ctx.ids.vB1, url: newer, origin: null, createdAt: new Date("2026-02-01T00:00:00Z") },
      ],
    });
    const { GALLERY_ORDER } = await import("@/lib/variant-gallery");
    const rows = await testPrisma.image.findMany({ where: { productId: ctx.ids.vB1 }, orderBy: GALLERY_ORDER, select: { url: true, isMain: true } });
    const nonCover = rows.filter((row) => !row.isMain).map((row) => row.url);
    expect(nonCover).toEqual([older, newer]);
    expect(rows[0]).toMatchObject({ url: ctx.g1, isMain: true });

    // Una foto propia nueva desde la ficha queda antes de la copia del grupo.
    const added = photo("ficha");
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: ctx.ids.vB1 } });
    const response = await PATCH(
      json("PATCH", {
        name: product.name, price: product.price, acqPrice: product.acqPrice, categoryId: product.categoryId,
        sizeId: product.sizeId, colorId: product.colorId, designId: product.designId, description: product.description,
        sku: product.sku, isArchived: false, isFeatured: false, productGroupId: product.productGroupId,
        hasNoProductIdentifier: true, preserveSlug: true,
        images: [{ url: older }, { url: newer }, { url: added, isMain: true }],
      }),
      { params: { storeId: ctx.f.store.id, productId: ctx.ids.vB1 } },
    );
    expect(response.status).toBe(200);
    expect(await urls(ctx.ids.vB1)).toEqual([older, newer, added, ctx.g1]);
  });

  it("saving twice without changes leaves the same photos, order and cover", async () => {
    const ctx = await setup();
    const body = [[{ url: ctx.own }, { url: ctx.g1, isMain: true }, { url: ctx.g2 }], [
      { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
      { url: ctx.g1, scope: "all" },
      { url: ctx.g2, scope: "all" },
    ]] as const;
    await patchGroup(ctx, [...body[0]], [...body[1]]);
    const before = await Promise.all(Object.values(ctx.ids).map(gallery));
    await patchGroup(ctx, [...body[0]], [...body[1]]);
    const after = await Promise.all(Object.values(ctx.ids).map(gallery));
    expect(after).toEqual(before);
  });

  it("a group save never touches Mercado Libre listings", async () => {
    const ctx = await setup();
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: ctx.f.store.id, provider: "MERCADOLIBRE", status: "CONNECTED", sellerId: `seller-${randomUUID()}` },
    });
    connectionId = connection.id;
    const listing = await testPrisma.marketplaceListing.create({
      data: { connectionId, productId: ctx.ids.vA1, externalItemId: "MCO999", status: "ACTIVE", categoryId: "MCO1", marketplacePrice: 30000 },
    });

    await patchGroup(
      ctx,
      [{ url: ctx.own }, { url: ctx.g1, isMain: true }, { url: ctx.g2 }],
      [
        { url: ctx.own, scope: `COMBO|${ctx.colorA.id}|${ctx.design1.id}` },
        { url: ctx.g1, scope: "all" },
        { url: ctx.g2, scope: "all" },
      ],
    );

    expect(await testPrisma.marketplaceOutboxEvent.count({ where: { connectionId } })).toBe(0);
    const after = await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.updatedAt).toEqual(listing.updatedAt);
    expect(after.metadata).toEqual(listing.metadata);
  });

  describe("variant product page (Productos)", () => {
    async function productBody(id: string, images: { url: string; isMain?: boolean }[], extra: Record<string, unknown> = {}) {
      const product = await testPrisma.product.findUniqueOrThrow({ where: { id } });
      return {
        name: product.name,
        price: product.price,
        acqPrice: product.acqPrice,
        categoryId: product.categoryId,
        sizeId: product.sizeId,
        colorId: product.colorId,
        designId: product.designId,
        description: product.description,
        sku: product.sku,
        images,
        isArchived: product.isArchived,
        isFeatured: product.isFeatured,
        productGroupId: product.productGroupId,
        hasNoProductIdentifier: true,
        preserveSlug: true,
        ...extra,
      };
    }

    it("keeps group copies even if the page omits them; new photos are own; the cover may be a copy", async () => {
      const ctx = await setup();
      const added = photo("subida-en-ficha");
      const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
      // vB1 solo tiene la copia g1; la ficha manda una foto nueva como portada y omite g1.
      const response = await PATCH(json("PATCH", await productBody(ctx.ids.vB1, [{ url: added, isMain: true }])), {
        params: { storeId: ctx.f.store.id, productId: ctx.ids.vB1 },
      });
      expect(response.status).toBe(200);
      const rows = await gallery(ctx.ids.vB1);
      expect(rows.map((row) => [row.url, row.origin])).toEqual([[added, "OWN"], [ctx.g1, "GROUP_COPY"]]);
      expect(await covers(ctx.ids.vB1)).toEqual([added]);

      const again = await PATCH(json("PATCH", await productBody(ctx.ids.vB1, [{ url: added }, { url: ctx.g1, isMain: true }])), {
        params: { storeId: ctx.f.store.id, productId: ctx.ids.vB1 },
      });
      expect(again.status).toBe(200);
      expect(await covers(ctx.ids.vB1)).toEqual([ctx.g1]);
      expect((await gallery(ctx.ids.vB1)).map((row) => row.origin)).toEqual(["OWN", "GROUP_COPY"]);
    });

    it("the product loader marks group copies so the page can show «Del grupo»", async () => {
      const ctx = await setup();
      const { getProduct } = await import("@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product");
      const { product } = await getProduct(ctx.ids.vA1, ctx.f.store.id);
      const byUrl = Object.fromEntries((product?.images ?? []).map((image) => [image.url, image.origin]));
      expect(byUrl).toEqual({ [ctx.own]: "OWN", [ctx.g1]: "GROUP_COPY" });
    });

    async function otherGroup(ctx: Ctx, scope: string) {
      const h1 = photo("h1");
      const group = await testPrisma.productGroup.create({
        data: {
          name: "Otro grupo",
          slug: `otro-grupo-${randomUUID().slice(0, 6)}`,
          description: "",
          storeId: ctx.f.store.id,
          images: { create: [{ url: h1, isMain: true, scope }] },
        },
      });
      return { groupId: group.id, h1 };
    }

    it("switching to another group removes the old group's copies and applies the new distribution", async () => {
      const ctx = await setup();
      const target = await otherGroup(ctx, "all");
      const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
      const response = await PATCH(
        json("PATCH", await productBody(ctx.ids.vB1, [{ url: ctx.g1, isMain: true }], { productGroupId: target.groupId })),
        { params: { storeId: ctx.f.store.id, productId: ctx.ids.vB1 } },
      );
      expect(response.status).toBe(200);
      expect((await gallery(ctx.ids.vB1)).map((row) => [row.url, row.origin, row.isMain])).toEqual([[target.h1, "GROUP_COPY", true]]);
    });

    it("switching groups keeps the old copies as own when the new group gives the variant nothing", async () => {
      const ctx = await setup();
      const target = await otherGroup(ctx, `COLOR|${ctx.colorA.id}`);
      const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
      const response = await PATCH(
        json("PATCH", await productBody(ctx.ids.vB1, [{ url: ctx.g1, isMain: true }], { productGroupId: target.groupId })),
        { params: { storeId: ctx.f.store.id, productId: ctx.ids.vB1 } },
      );
      expect(response.status).toBe(200);
      expect((await gallery(ctx.ids.vB1)).map((row) => [row.url, row.origin, row.isMain])).toEqual([[ctx.g1, "OWN", true]]);
    });

    it("leaving the group from the page turns its copies into own photos", async () => {
      const ctx = await setup();
      const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
      const response = await PATCH(
        json("PATCH", await productBody(ctx.ids.vB1, [{ url: ctx.g1, isMain: true }], { productGroupId: "none" })),
        { params: { storeId: ctx.f.store.id, productId: ctx.ids.vB1 } },
      );
      expect(response.status).toBe(200);
      const rows = await gallery(ctx.ids.vB1);
      expect(rows.map((row) => [row.url, row.origin, row.isMain])).toEqual([[ctx.g1, "OWN", true]]);
    });
  });

  it("ungrouping (deleting the group, keeping variants) turns copies into own photos", async () => {
    const ctx = await setup();
    const { DELETE } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const response = await DELETE(new Request("http://admin.test/api/x", { method: "DELETE" }), {
      params: { storeId: ctx.f.store.id, productGroupId: ctx.groupId },
    });
    expect(response.status).toBe(200);
    for (const id of Object.values(ctx.ids)) {
      const rows = await gallery(id);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.origin === "OWN")).toBe(true);
      expect(rows.filter((row) => row.isMain)).toHaveLength(1);
    }
  });
});
