import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PATCH } from "@/app/api/[storeId]/product-groups/[productGroupId]/route";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({
    users: { getUser: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  default: { uploader: { destroy: vi.fn() } },
}));

/**
 * ProductGroup no tiene columna de archivado: la casilla «Archivado» del
 * formulario de grupo sólo tiene sentido si archiva (y restaura) todas sus
 * variantes. Antes el PATCH ignoraba el campo y el botón no hacía nada.
 */
describe("archiving a product group", () => {
  let fixture: InventoryFixture | undefined;
  let groupId: string | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await testPrisma.product.updateMany({
        where: { storeId: fixture.store.id },
        data: { productGroupId: null },
      });
      await testPrisma.image.deleteMany({
        where: { productId: fixture.component.id },
      });
      if (groupId)
        await testPrisma.productGroup.deleteMany({ where: { id: groupId } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const patch = (storeId: string, body: Record<string, unknown>) =>
    PATCH(
      new Request("https://admin.test/api/store/product-groups/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: { storeId, productGroupId: groupId! } },
    );

  it("archives every variant when the group flag is on and restores them when it is off", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const keep = fixture.component;
    const group = await testPrisma.productGroup.create({
      data: {
        name: "Grupo archivable",
        slug: `grupo-archivable-${randomUUID()}`,
        description: "Pruebas",
        storeId: fixture.store.id,
      },
    });
    groupId = group.id;
    await testPrisma.product.update({
      where: { id: keep.id },
      data: { productGroupId: group.id },
    });

    const body = (isArchived: boolean) => ({
      name: "Grupo archivable",
      images: [{ url: "https://res.cloudinary.com/test/g.jpg", isMain: true }],
      categoryId: fixture!.category.id,
      preserveSlug: true,
      isArchived,
      variants: [
        {
          id: keep.id,
          sizeId: keep.sizeId,
          colorId: keep.colorId,
          designId: keep.designId,
          sku: keep.sku,
          price: "10000",
          acqPrice: "4000",
          stock: keep.stock,
          // La variante dice «activa»; la casilla del grupo manda.
          isArchived: false,
        },
      ],
    });

    expect((await patch(fixture.store.id, body(true))).status).toBe(200);
    expect(
      (await testPrisma.product.findUniqueOrThrow({ where: { id: keep.id } }))
        .isArchived,
    ).toBe(true);

    expect((await patch(fixture.store.id, body(false))).status).toBe(200);
    expect(
      (await testPrisma.product.findUniqueOrThrow({ where: { id: keep.id } }))
        .isArchived,
    ).toBe(false);
  });
});
