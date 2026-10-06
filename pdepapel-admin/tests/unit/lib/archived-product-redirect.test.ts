import { describe, expect, it, vi } from "vitest";

import { chooseArchivedProductRedirect, findArchivedProductRedirect } from "@/lib/archived-product-redirect";

/**
 * Política del 2026-10-05: un producto archivado ya no es un 404. Va a lo más
 * parecido: hermana viva, categoría, tipo, tienda (en ese orden).
 */
describe("chooseArchivedProductRedirect", () => {
  const liveCategory = { slug: "termos", isArchived: false, hasLiveProducts: true };
  const liveType = { id: "type-1", isArchived: false };

  it("prefers a live sibling of the same group", () => {
    expect(chooseArchivedProductRedirect({ sibling: { id: "s", slug: "termo-owala-negro" }, category: liveCategory, type: liveType })).toEqual({
      kind: "product",
      slug: "termo-owala-negro",
    });
  });

  it("falls back to the category, then the type, then the shop", () => {
    expect(chooseArchivedProductRedirect({ sibling: null, category: liveCategory, type: liveType })).toEqual({ kind: "category", slug: "termos" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: { ...liveCategory, isArchived: true }, type: liveType })).toEqual({ kind: "type", id: "type-1" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: { ...liveCategory, slug: "" }, type: liveType })).toEqual({ kind: "type", id: "type-1" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: null, type: null })).toEqual({ kind: "shop" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: { slug: "x", isArchived: true, hasLiveProducts: true }, type: { id: "t", isArchived: true } })).toEqual({ kind: "shop" });
  });

  /** Una categoría sin productos vivos es un listado vacío: soft 404. Se salta. */
  it("skips a category with no live products and goes on to the type, then the shop", () => {
    const empty = { ...liveCategory, hasLiveProducts: false };
    expect(chooseArchivedProductRedirect({ sibling: null, category: empty, type: liveType })).toEqual({ kind: "type", id: "type-1" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: empty, type: { id: "t", isArchived: true } })).toEqual({ kind: "shop" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: empty, type: null })).toEqual({ kind: "shop" });
  });

  it("uses the sibling id when it has no slug", () => {
    expect(chooseArchivedProductRedirect({ sibling: { id: "uuid-1", slug: "" }, category: null, type: null })).toEqual({ kind: "product", slug: "uuid-1" });
  });
});

describe("findArchivedProductRedirect", () => {
  const db = (overrides: Record<string, unknown> = {}) => {
    const product = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ id: "archivado", productGroupId: "g1", categoryId: "c1" })
        .mockResolvedValueOnce({ id: "hermana", slug: "termo-owala-negro" }),
      count: vi.fn().mockResolvedValue(3),
    };
    return {
      product,
      productSlugAlias: { findUnique: vi.fn() },
      category: { findFirst: vi.fn().mockResolvedValue({ slug: "termos", isArchived: false, typeId: "t1" }) },
      type: { findFirst: vi.fn().mockResolvedValue({ id: "t1", isArchived: false }) },
      deletedProductUrl: { findFirst: vi.fn().mockResolvedValue(null) },
      ...overrides,
    };
  };

  it("finds the archived product, then its live sibling (in-stock first), scoped to the store", async () => {
    const client = db();
    await expect(findArchivedProductRedirect(client as never, "store-1", "termo-owala-rojo")).resolves.toEqual({
      kind: "product",
      slug: "termo-owala-negro",
    });
    expect(client.product.findFirst.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", isArchived: true });
    expect(client.product.findFirst.mock.calls[1][0]).toMatchObject({
      where: { storeId: "store-1", productGroupId: "g1", isArchived: false, id: { not: "archivado" } },
      orderBy: [{ stock: "desc" }, { createdAt: "asc" }],
    });
  });

  it("follows an alias to an archived product", async () => {
    const product = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "archivado", productGroupId: null, categoryId: "c1" }),
      count: vi.fn().mockResolvedValue(3),
    };
    const client = db({ product, productSlugAlias: { findUnique: vi.fn().mockResolvedValue({ productId: "archivado" }) } });
    await expect(findArchivedProductRedirect(client as never, "store-1", "termo-owala-rojo-aesthetic-l")).resolves.toEqual({
      kind: "category",
      slug: "termos",
    });
  });

  it("falls back to the URL record of a deleted product, scoped to the store", async () => {
    const deletedProductUrl = {
      findFirst: vi.fn().mockResolvedValue({ productId: "borrado", productGroupId: null, categoryId: "c1" }),
    };
    const client = db({
      product: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1) },
      productSlugAlias: { findUnique: vi.fn().mockResolvedValue(null) },
      deletedProductUrl,
    });
    await expect(findArchivedProductRedirect(client as never, "store-1", "termo-borrado")).resolves.toEqual({
      kind: "category",
      slug: "termos",
    });
    expect(deletedProductUrl.findFirst.mock.calls[0][0].where).toEqual({
      storeId: "store-1",
      OR: [{ slug: "termo-borrado" }, { productId: "termo-borrado" }],
    });
  });

  it("only counts the category's live products when the category would be the destination", async () => {
    const product = {
      findFirst: vi.fn().mockResolvedValueOnce({ id: "archivado", productGroupId: null, categoryId: "c1" }),
      count: vi.fn().mockResolvedValue(0),
    };
    const client = db({ product });
    // Categoría vacía: se salta y va al tipo.
    await expect(findArchivedProductRedirect(client as never, "store-1", "termo-unico")).resolves.toEqual({ kind: "type", id: "t1" });
    expect(product.count.mock.calls[0][0]).toMatchObject({
      where: { storeId: "store-1", categoryId: "c1", isArchived: false },
      take: 1,
    });
    // La misma regla de disponibilidad del listado: lo «próximamente» no cuenta.
    expect(product.count.mock.calls[0][0].where.OR).toEqual([{ availableAt: null }, { availableAt: { lte: expect.any(Date) } }]);
  });

  it("does not count products when a live sibling already answers", async () => {
    const client = db();
    await findArchivedProductRedirect(client as never, "store-1", "termo-owala-rojo");
    expect(client.product.count).not.toHaveBeenCalled();
  });

  it("returns null for a reference that never existed: that stays a real 404", async () => {
    const client = db({
      product: { findFirst: vi.fn().mockResolvedValue(null) },
      productSlugAlias: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    await expect(findArchivedProductRedirect(client as never, "store-1", "no-existe")).resolves.toBeNull();
  });
});
