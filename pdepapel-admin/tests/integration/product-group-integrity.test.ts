import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MarketplaceOutboxAction, MarketplaceProvider } from "@prisma/client";

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
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: vi.fn() }));

const json = (method: string, body?: unknown, url = "http://admin.test/api/x") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const IMAGE = "https://res.cloudinary.com/test/image/upload/v1/grupo.jpg";

/**
 * Fase 2B, integridad: adoptar por id exige tienda, grupo, kit y archivado;
 * adoptar conserva los datos del producto; quitar una variante usa la misma
 * guarda que «Eliminar»; una variante nueva nace con 0 unidades; archivar
 * pausa Mercado Libre; y DELETE respeta la tienda.
 */
describe("product group integrity with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let other: InventoryFixture | undefined;
  let connectionId: string | undefined;
  const suffix = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    for (const f of [fixture, other]) {
      if (!f) continue;
      const storeId = f.store.id;
      if (connectionId) {
        await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { connectionId } });
        await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
        await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
        connectionId = undefined;
      }
      await testPrisma.image.deleteMany({
        where: { OR: [{ product: { storeId } }, { productGroup: { storeId } }] },
      });
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId } });
      await testPrisma.inventoryMovement.deleteMany({ where: { storeId } });
      await testPrisma.product.updateMany({ where: { storeId }, data: { productGroupId: null } });
      await testPrisma.product.deleteMany({
        where: { storeId, id: { notIn: [f.component.id, f.kit.id] } },
      });
      await testPrisma.productGroup.deleteMany({ where: { storeId } });
      await testPrisma.color.deleteMany({ where: { storeId, name: { startsWith: "Extra" } } });
      await deleteInventoryFixture(f);
    }
    fixture = undefined;
    other = undefined;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function setup() {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    return fixture;
  }

  // Cada producto con su propio color: dos filas con la misma combinación
  // de tamaño, color y diseño no pueden convivir en un grupo.
  async function createProduct(
    f: InventoryFixture,
    name: string,
    extra: Record<string, unknown> = {},
  ) {
    const s = suffix();
    const color = await testPrisma.color.create({
      data: { name: `Extra ${s}`, value: `extra-${s}`, storeId: f.store.id },
    });
    return testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${s}`,
        description: "Descripción propia",
        stock: 5,
        price: 15000,
        acqPrice: 9000,
        sku: `TEST-${s}`,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: color.id,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
        gtin: "7701234567897",
        hasNoProductIdentifier: false,
        images: { create: [{ url: `https://res.cloudinary.com/test/image/upload/v1/${s}.jpg`, isMain: true }] },
        ...extra,
      },
    });
  }

  async function createGroup(f: InventoryFixture, memberIds: string[]) {
    const group = await testPrisma.productGroup.create({
      data: {
        name: "Grupo prueba",
        slug: `grupo-prueba-${suffix()}`,
        description: "",
        storeId: f.store.id,
        images: { create: [{ url: IMAGE, isMain: true }] },
      },
    });
    await testPrisma.product.updateMany({
      where: { id: { in: memberIds } },
      data: { productGroupId: group.id },
    });
    return group;
  }

  const row = (p: { id?: string; sizeId: string; colorId: string; designId: string; sku: string }, extra: Record<string, unknown> = {}) => ({
    id: p.id,
    sizeId: p.sizeId,
    colorId: p.colorId,
    designId: p.designId,
    sku: p.sku,
    ...extra,
  });

  const patchBody = (f: InventoryFixture, variants: unknown[], extra: Record<string, unknown> = {}) => ({
    name: "Grupo prueba",
    images: [{ url: IMAGE, isMain: true }],
    categoryId: f.category.id,
    preserveSlug: true,
    confirmRemovals: true,
    variants,
    ...extra,
  });

  it("refuses to adopt a product of another store, a kit, a product of another group or an archived one", async () => {
    const f = await setup();
    other = await createInventoryFixture();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const member = await createProduct(f, "Miembro");
    const group = await createGroup(f, [member.id]);
    const foreign = other.component;
    const params = { params: { storeId: f.store.id, productGroupId: group.id } };

    const cross = await PATCH(
      json("PATCH", patchBody(f, [row(member), row({ ...foreign, id: foreign.id })])),
      params,
    );
    expect(cross.status).toBe(404);
    const untouched = await testPrisma.product.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.storeId).toBe(other.store.id);
    expect(untouched.productGroupId).toBeNull();

    const kit = await PATCH(json("PATCH", patchBody(f, [row(member), row({ ...f.kit, id: f.kit.id })])), params);
    expect(kit.status).toBe(409);
    expect((await kit.json()).error).toContain("kit");

    const grouped = await createProduct(f, "De otro grupo");
    await createGroup(f, [grouped.id]);
    const otherGroup = await PATCH(json("PATCH", patchBody(f, [row(member), row({ ...grouped, id: grouped.id })])), params);
    expect(otherGroup.status).toBe(409);
    expect((await otherGroup.json()).error).toContain("otro grupo");

    const archived = await createProduct(f, "Archivado", { isArchived: true });
    const arch = await PATCH(json("PATCH", patchBody(f, [row(member), row({ ...archived, id: archived.id })])), params);
    expect(arch.status).toBe(409);
    expect((await arch.json()).error).toContain("archivado");
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: archived.id } })).productGroupId).toBeNull();
  });

  it("adopting a standalone product keeps its price, cost, supplier, description, GTIN, slug and stock", async () => {
    const f = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const member = await createProduct(f, "Miembro");
    const group = await createGroup(f, [member.id]);
    const standalone = await createProduct(f, "Cartuchera suelta");

    const res = await PATCH(
      json(
        "PATCH",
        patchBody(f, [row(member), row({ ...standalone, id: standalone.id })], {
          defaultPrice: "1000",
          defaultCost: "500",
          description: "Descripción del grupo",
        }),
      ),
      { params: { storeId: f.store.id, productGroupId: group.id } },
    );
    expect(res.status).toBe(200);
    const adopted = await testPrisma.product.findUniqueOrThrow({ where: { id: standalone.id } });
    expect(adopted.productGroupId).toBe(group.id);
    expect(adopted.price).toBe(15000);
    expect(adopted.acqPrice).toBe(9000);
    expect(adopted.description).toBe("Descripción propia");
    expect(adopted.gtin).toBe("7701234567897");
    expect(adopted.hasNoProductIdentifier).toBe(false);
    expect(adopted.slug).toBe(standalone.slug);
    expect(adopted.stock).toBe(5);
    expect(await testPrisma.inventoryMovement.count({ where: { productId: standalone.id } })).toBe(0);
  });

  it("a new variant starts at 0 units with no phantom initial movement, even when the payload carries stock", async () => {
    const f = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const member = await createProduct(f, "Miembro");
    const group = await createGroup(f, [member.id]);
    const extraColor = await testPrisma.color.create({
      data: { name: "Extra verde", value: `verde-${suffix()}`, storeId: f.store.id },
    });

    const res = await PATCH(
      json(
        "PATCH",
        patchBody(f, [
          row(member),
          { sizeId: member.sizeId, colorId: extraColor.id, designId: member.designId, sku: `NEW-${suffix()}`, name: "Miembro Verde", stock: 12, price: "15000" },
        ], { defaultStock: 12 }),
      ),
      { params: { storeId: f.store.id, productGroupId: group.id } },
    );
    expect(res.status).toBe(200);
    const created = await testPrisma.product.findFirstOrThrow({ where: { productGroupId: group.id, colorId: extraColor.id } });
    expect(created.stock).toBe(0);
    expect(await testPrisma.inventoryMovement.count({ where: { productId: created.id } })).toBe(0);
    expect(created.slug).not.toBe("");
  });

  it("removing a variant runs the product delete guard: blocked rows are archived and named, free rows are deleted with a redirect", async () => {
    const f = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const keep = await createProduct(f, "Se queda");
    // El componente del kit de la fixture está bloqueado por «Kits».
    const blocked = f.component;
    const free = await createProduct(f, "Libre");
    const group = await createGroup(f, [keep.id, blocked.id, free.id]);
    const params = { params: { storeId: f.store.id, productGroupId: group.id } };

    const preview = await PATCH(json("PATCH", patchBody(f, [row(keep)], { confirmRemovals: false })), params);
    expect(preview.status).toBe(409);
    const details = (await preview.json()).details;
    const removals = details.removals as { id: string; action: string; blockers: { kind: string }[] }[];
    expect(removals.find((r) => r.id === blocked.id)).toMatchObject({ action: "archive" });
    expect(removals.find((r) => r.id === blocked.id)?.blockers.map((b) => b.kind)).toContain("kits");
    expect(removals.find((r) => r.id === free.id)).toMatchObject({ action: "delete", blockers: [] });

    const res = await PATCH(json("PATCH", patchBody(f, [row(keep)])), params);
    expect(res.status).toBe(200);
    const stillThere = await testPrisma.product.findUniqueOrThrow({ where: { id: blocked.id } });
    expect(stillThere.isArchived).toBe(true);
    expect(stillThere.productGroupId).toBe(group.id);
    expect(await testPrisma.product.findUnique({ where: { id: free.id } })).toBeNull();
    const alias = await testPrisma.productSlugAlias.findFirst({ where: { storeId: f.store.id, slug: free.slug } });
    expect(alias?.productId).toBe(keep.id);
  });

  it("group archive flag applies to all, an omitted flag respects each row, and archiving pauses Mercado Libre", async () => {
    const f = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const a = await createProduct(f, "Variante A");
    const b = await createProduct(f, "Variante B");
    const group = await createGroup(f, [a.id, b.id]);
    const params = { params: { storeId: f.store.id, productGroupId: group.id } };
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: "CONNECTED" },
    });
    connectionId = connection.id;
    const listing = await testPrisma.marketplaceListing.create({
      data: { connectionId: connection.id, productId: b.id, externalItemId: "MCO-2B", status: "ACTIVE" },
    });

    // Sin casilla del grupo: la fila B se archiva, la A no.
    const perRow = await PATCH(json("PATCH", patchBody(f, [row(a, { isArchived: false }), row(b, { isArchived: true })])), params);
    expect(perRow.status).toBe(200);
    expect((await perRow.json()).pausedListings).toBe(1);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: a.id } })).isArchived).toBe(false);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: b.id } })).isArchived).toBe(true);
    expect(
      await testPrisma.marketplaceOutboxEvent.count({
        where: { listingId: listing.id, action: MarketplaceOutboxAction.SYNC_LISTING_STATUS },
      }),
    ).toBe(1);

    // Guardar otra vez sin tocar nada no republica B (antes leía products[0]).
    const again = await PATCH(json("PATCH", patchBody(f, [row(a), row(b)])), params);
    expect(again.status).toBe(200);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: b.id } })).isArchived).toBe(true);

    // Casilla del grupo «todas a la venta» / «todas archivadas».
    expect((await PATCH(json("PATCH", patchBody(f, [row(a), row(b)], { isArchived: false })), params)).status).toBe(200);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: b.id } })).isArchived).toBe(false);
    expect((await PATCH(json("PATCH", patchBody(f, [row(a), row(b)], { isArchived: true })), params)).status).toBe(200);
    const rows = await testPrisma.product.findMany({ where: { productGroupId: group.id }, select: { isArchived: true } });
    expect(rows.every((r) => r.isArchived)).toBe(true);
  });

  it("the variant edit payload cannot wipe a GTIN by omission, and a duplicate GTIN answers 409", async () => {
    const f = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const a = await createProduct(f, "Con código");
    const b = await createProduct(f, "Otro", { gtin: null, hasNoProductIdentifier: true });
    const group = await createGroup(f, [a.id, b.id]);
    const params = { params: { storeId: f.store.id, productGroupId: group.id } };

    // Fila sin gtin/mpn/hasNoProductIdentifier: no se toca.
    expect((await PATCH(json("PATCH", patchBody(f, [row(a, { price: "16000" }), row(b)])), params)).status).toBe(200);
    const kept = await testPrisma.product.findUniqueOrThrow({ where: { id: a.id } });
    expect(kept.gtin).toBe("7701234567897");
    expect(kept.price).toBe(16000);

    const dup = await PATCH(json("PATCH", patchBody(f, [row(a), row(b, { gtin: "7701234567897", hasNoProductIdentifier: false })])), params);
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toContain("GTIN");
  });

  it("DELETE is store-scoped and names the blockers when deleting the variants", async () => {
    const f = await setup();
    other = await createInventoryFixture();
    const { DELETE } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const member = await createProduct(f, "Miembro");
    const group = await createGroup(f, [member.id, f.component.id]);

    // La dueña de la otra tienda, con su propio storeId, no alcanza este grupo.
    session.userId = other.store.userId;
    const cross = await DELETE(
      json("DELETE", undefined, "http://admin.test/api/x?deleteVariants=true"),
      { params: { storeId: other.store.id, productGroupId: group.id } },
    );
    expect(cross.status).toBe(404);
    session.userId = f.store.userId;
    expect(await testPrisma.productGroup.findUnique({ where: { id: group.id } })).not.toBeNull();

    const blocked = await DELETE(
      json("DELETE", undefined, "http://admin.test/api/x?deleteVariants=true"),
      { params: { storeId: f.store.id, productGroupId: group.id } },
    );
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toContain("Kits".toLowerCase());
    expect(await testPrisma.product.findUnique({ where: { id: member.id } })).not.toBeNull();

    const unlink = await DELETE(json("DELETE"), { params: { storeId: f.store.id, productGroupId: group.id } });
    expect(unlink.status).toBe(200);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: member.id } })).productGroupId).toBeNull();
  });

  it("POST validates adopted ids the same way and creates new variants at 0 units", async () => {
    const f = await setup();
    const { POST } = await import("@/app/api/[storeId]/product-groups/route");
    const standalone = await createProduct(f, "Suelta adoptable");
    const body = (rows: unknown[]) => ({
      name: "Grupo nuevo",
      categoryId: f.category.id,
      images: [{ url: IMAGE, isMain: true }],
      defaultPrice: 12000,
      defaultCost: 6000,
      variants: rows,
    });
    const params = { params: { storeId: f.store.id } };

    const kit = await POST(json("POST", body([row({ ...f.kit, id: f.kit.id })])), params);
    expect(kit.status).toBe(409);

    const extraColor = await testPrisma.color.create({
      data: { name: "Extra menta", value: `menta-${suffix()}`, storeId: f.store.id },
    });
    const ok = await POST(
      json("POST", body([
        row({ ...standalone, id: standalone.id }),
        { sizeId: standalone.sizeId, colorId: extraColor.id, designId: standalone.designId, sku: `NEW-${suffix()}`, name: "Grupo nuevo Menta", stock: 9 },
      ])),
      params,
    );
    expect(ok.status).toBe(200);
    const groupId = (await ok.json()).id as string;
    const adopted = await testPrisma.product.findUniqueOrThrow({ where: { id: standalone.id } });
    expect(adopted.productGroupId).toBe(groupId);
    expect(adopted.price).toBe(15000);
    expect(adopted.gtin).toBe("7701234567897");
    const created = await testPrisma.product.findFirstOrThrow({ where: { productGroupId: groupId, colorId: extraColor.id } });
    expect(created.stock).toBe(0);
    expect(created.price).toBe(12000);
    expect(await testPrisma.inventoryMovement.count({ where: { productId: created.id } })).toBe(0);
  });
});
