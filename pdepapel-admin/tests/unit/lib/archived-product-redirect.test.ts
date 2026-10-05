import { describe, expect, it, vi } from "vitest";

import { chooseArchivedProductRedirect, findArchivedProductRedirect } from "@/lib/archived-product-redirect";

/**
 * Política del 2026-10-05: un producto archivado ya no es un 404. Va a lo más
 * parecido: hermana viva, categoría, tipo, tienda (en ese orden).
 */
describe("chooseArchivedProductRedirect", () => {
  const liveCategory = { slug: "termos", isArchived: false };
  const liveType = { id: "type-1", isArchived: false };

  it("prefers a live sibling of the same group", () => {
    expect(chooseArchivedProductRedirect({ sibling: { id: "s", slug: "termo-owala-negro" }, category: liveCategory, type: liveType })).toEqual({
      kind: "product",
      slug: "termo-owala-negro",
    });
  });

  it("falls back to the category, then the type, then the shop", () => {
    expect(chooseArchivedProductRedirect({ sibling: null, category: liveCategory, type: liveType })).toEqual({ kind: "category", slug: "termos" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: { slug: "termos", isArchived: true }, type: liveType })).toEqual({ kind: "type", id: "type-1" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: { slug: "", isArchived: false }, type: liveType })).toEqual({ kind: "type", id: "type-1" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: null, type: null })).toEqual({ kind: "shop" });
    expect(chooseArchivedProductRedirect({ sibling: null, category: { slug: "x", isArchived: true }, type: { id: "t", isArchived: true } })).toEqual({ kind: "shop" });
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
    };
    return {
      product,
      productSlugAlias: { findUnique: vi.fn() },
      category: { findFirst: vi.fn().mockResolvedValue({ slug: "termos", isArchived: false, typeId: "t1" }) },
      type: { findFirst: vi.fn().mockResolvedValue({ id: "t1", isArchived: false }) },
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
    };
    const client = db({ product, productSlugAlias: { findUnique: vi.fn().mockResolvedValue({ productId: "archivado" }) } });
    await expect(findArchivedProductRedirect(client as never, "store-1", "termo-owala-rojo-aesthetic-l")).resolves.toEqual({
      kind: "category",
      slug: "termos",
    });
  });

  it("returns null for a reference that never existed: that stays a real 404", async () => {
    const client = db({
      product: { findFirst: vi.fn().mockResolvedValue(null) },
      productSlugAlias: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    await expect(findArchivedProductRedirect(client as never, "store-1", "no-existe")).resolves.toBeNull();
  });
});
