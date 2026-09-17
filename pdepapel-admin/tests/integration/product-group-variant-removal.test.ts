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
 * Quitar una variante sin pedidos del grupo la borra de verdad, y con
 * relationMode=prisma la cascada se lleva también sus alias. La URL vieja
 * tiene que seguir llegando a una hermana viva.
 */
describe("product group variant removal keeps the old URLs", () => {
  let fixture: InventoryFixture | undefined;
  let groupId: string | undefined;
  let colorId: string | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await testPrisma.productSlugAlias.deleteMany({
        where: { storeId: fixture.store.id },
      });
      await testPrisma.product.updateMany({
        where: { storeId: fixture.store.id },
        data: { productGroupId: null },
      });
      await testPrisma.image.deleteMany({
        where: { productId: fixture.component.id },
      });
      if (groupId)
        await testPrisma.productGroup.deleteMany({ where: { id: groupId } });
      if (colorId)
        await testPrisma.color.deleteMany({ where: { id: colorId } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("redirects the removed variant's slug and its old aliases to the surviving sibling", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const suffix = randomUUID();
    const keep = fixture.component;

    const group = await testPrisma.productGroup.create({
      data: {
        name: "Carpeta pastel",
        slug: `carpeta-pastel-${suffix}`,
        description: "Grupo de pruebas",
        storeId: fixture.store.id,
      },
    });
    groupId = group.id;
    const color = await testPrisma.color.create({
      data: {
        name: "Azul pastel",
        value: `azul-${suffix}`,
        storeId: fixture.store.id,
      },
    });
    colorId = color.id;
    await testPrisma.product.update({
      where: { id: keep.id },
      data: { productGroupId: group.id },
    });
    const removed = await testPrisma.product.create({
      data: {
        name: "Carpeta pastel Azul",
        slug: `carpeta-pastel-azul-${suffix}`,
        description: "Variante que se va",
        stock: 0,
        price: 10000,
        acqPrice: 4000,
        sku: `TEST-${suffix}-AZUL`,
        storeId: fixture.store.id,
        categoryId: fixture.category.id,
        colorId: color.id,
        sizeId: keep.sizeId,
        designId: keep.designId,
        productGroupId: group.id,
      },
    });
    await testPrisma.productSlugAlias.create({
      data: {
        storeId: fixture.store.id,
        productId: removed.id,
        slug: `carpeta-azul-vieja-${suffix}`,
      },
    });

    const response = await PATCH(
      new Request("https://admin.test/api/store/product-groups/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Carpeta pastel",
          images: [
            {
              url: "https://res.cloudinary.com/test/carpeta.jpg",
              isMain: true,
            },
          ],
          categoryId: fixture.category.id,
          preserveSlug: true,
          confirmRemovals: true,
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
            },
          ],
        }),
      }),
      { params: { storeId: fixture.store.id, productGroupId: group.id } },
    );
    expect(response.status).toBe(200);

    expect(
      await testPrisma.product.findUnique({ where: { id: removed.id } }),
    ).toBeNull();

    const aliases = await testPrisma.productSlugAlias.findMany({
      where: { storeId: fixture.store.id },
      orderBy: { slug: "asc" },
      select: { slug: true, productId: true },
    });
    expect(aliases).toEqual([
      { slug: `carpeta-azul-vieja-${suffix}`, productId: keep.id },
      { slug: `carpeta-pastel-azul-${suffix}`, productId: keep.id },
    ]);
  });
});
