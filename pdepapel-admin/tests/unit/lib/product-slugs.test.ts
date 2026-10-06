import { getUniqueProductSlug, getVariantSlugAttributeInclusion, synchronizeProductGroupSlugs } from "@/lib/product-slugs";
import { describe, expect, it, vi } from "vitest";

describe("variant slug attributes", () => {
  it("keeps shared operational attributes out of variant URLs", () => {
    const inclusion = getVariantSlugAttributeInclusion([
      {
        color: { name: "Amarillo pastel" },
        design: { name: "Kawaii" },
        size: { name: "S+", value: "S-P" },
      },
      {
        color: { name: "Azul pastel" },
        design: { name: "Kawaii" },
        size: { name: "S+", value: "S-P" },
      },
    ]);

    expect(inclusion).toEqual({
      color: true,
      design: false,
      size: false,
    });
  });

  it("includes an attribute when it is the only customer-visible difference", () => {
    const inclusion = getVariantSlugAttributeInclusion([
      {
        color: { name: "Sin Color" },
        design: { name: "Hello Kitty" },
        size: { name: "A5", value: "A5" },
      },
      {
        color: { name: "Sin Color" },
        design: { name: "Kuromi" },
        size: { name: "A5", value: "A5" },
      },
    ]);

    expect(inclusion).toEqual({
      color: false,
      design: true,
      size: false,
    });
  });
});

describe("getUniqueProductSlug", () => {
  const client = (taken: { products?: string[]; aliases?: string[]; deleted?: string[] }) => ({
    product: { findFirst: vi.fn(async ({ where }: { where: { slug: string } }) => (taken.products?.includes(where.slug) ? { id: "otro" } : null)) },
    productSlugAlias: { findUnique: vi.fn(async ({ where }: { where: { storeId_slug: { slug: string } } }) => (taken.aliases?.includes(where.storeId_slug.slug) ? { productId: "otro" } : null)) },
    deletedProductUrl: { findUnique: vi.fn(async ({ where }: { where: { storeId_slug: { slug: string } } }) => (taken.deleted?.includes(where.storeId_slug.slug) ? { id: "d" } : null)) },
  });

  it("never returns an empty slug", async () => {
    await expect(getUniqueProductSlug(client({}) as never, { storeId: "s", baseSlug: "" })).resolves.toBe("producto");
  });

  it("skips slugs taken by products, aliases and the URLs of deleted products", async () => {
    const db = client({ products: ["agenda"], aliases: ["agenda-2"], deleted: ["agenda-3"] });
    await expect(getUniqueProductSlug(db as never, { storeId: "s", baseSlug: "agenda" })).resolves.toBe("agenda-4");
    expect(db.deletedProductUrl.findUnique.mock.calls[0][0]).toEqual({ where: { storeId_slug: { storeId: "s", slug: "agenda" } }, select: { id: true } });
  });
});

describe("synchronizeProductGroupSlugs", () => {
  const variant = (id: string, slug: string, color: string) => ({ id, slug, name: "Termo", color: { name: color, value: "#000" }, design: { name: "Liso" }, size: { name: "Único", value: "U" } });
  const client = (products: ReturnType<typeof variant>[], deleted: string[] = []) => ({
    product: {
      findMany: vi.fn().mockResolvedValueOnce(products).mockResolvedValueOnce([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    productSlugAlias: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    deletedProductUrl: { findMany: vi.fn().mockResolvedValue(deleted.map((slug) => ({ slug }))) },
  });

  it("does not keep the provisional slug of a product created in the same operation as an alias", async () => {
    const db = client([variant("a", "termo-viejo", "Rojo"), variant("b", "termo-provisional", "Azul")]);
    await synchronizeProductGroupSlugs(db as never, "s", "g", { newProductIds: ["b"] });
    // La URL vieja del producto existente se conserva; la provisional de la nueva no.
    expect(db.productSlugAlias.create.mock.calls.map((call) => call[0].data.slug)).toEqual(["termo-viejo"]);
    expect(db.product.update).toHaveBeenCalledTimes(2);
  });

  it("does not hand out the URL of a deleted product", async () => {
    const db = client([variant("a", "", "Rojo"), variant("b", "", "Azul")], ["termo-rojo"]);
    await synchronizeProductGroupSlugs(db as never, "s", "g");
    const slugs = db.product.update.mock.calls.map((call) => call[0].data.slug);
    expect(slugs).not.toContain("termo-rojo");
    expect(slugs.every(Boolean)).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
