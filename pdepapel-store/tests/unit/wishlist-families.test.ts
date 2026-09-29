/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { refreshWishlistItems, useWishlist, type WishlistProduct } from "@/hooks/use-wishlist";
import { buildCatalogSearchParams, parseCatalogSearchParams } from "@/lib/catalog-params";
import { slimStoredProduct } from "@/lib/stored-product";
import type { Product } from "@/types";

/**
 * Un grupo guardado desde la tarjeta es una familia: sobrevive a la
 * persistencia y al refresco, y no se convierte en la variante que le ponía
 * cara ese día.
 */
const family = {
  id: "v-naranja",
  slug: "kit-basico-girly-naranja",
  name: "Kits Básicos de apuntes",
  price: 18000,
  stock: 3,
  images: [{ id: "i1", url: "https://res.cloudinary.com/demo/g.jpg", isMain: true }],
  reviews: [],
  isGroup: true,
  productGroupId: "g1",
  variantCount: 4,
  minPrice: 18000,
  maxPrice: 24000,
} as unknown as Product;

const simple = { id: "s1", slug: "washi", name: "Washi pastel", price: "5000", stock: 4, images: [], reviews: [] } as unknown as Product;

beforeEach(() => {
  useWishlist.setState({ items: [], guestItems: [], accountUserId: null, isHydrated: true });
});

describe("favoritos guardados como familia", () => {
  it("la tarjeta guarda el grupo con la intención de familia; un producto simple no", () => {
    useWishlist.getState().addItem(family);
    useWishlist.getState().addItem(simple);
    const [saved, plain] = useWishlist.getState().items;
    expect(saved).toMatchObject({ id: "v-naranja", savedAsGroup: true, isGroup: true, productGroupId: "g1" });
    expect(plain.savedAsGroup).toBe(false);
  });

  it("lo que se persiste conserva la familia y la intención", () => {
    const slim = slimStoredProduct(family);
    expect(slim).toMatchObject({ isGroup: true, productGroupId: "g1", variantCount: 4, minPrice: 18000, maxPrice: 24000, name: "Kits Básicos de apuntes" });
    useWishlist.getState().addItem(family);
    const persisted = useWishlist.persist.getOptions().partialize?.(useWishlist.getState()) as unknown as { guestItems: WishlistProduct[] };
    expect(persisted.guestItems[0]).toMatchObject({ id: "v-naranja", savedAsGroup: true, isGroup: true, productGroupId: "g1" });
  });

  it("al refrescar, la familia manda sobre la variante y conserva id y slug", () => {
    const stored = { ...family, addedOn: new Date("2026-09-20T12:00:00Z"), savedAsGroup: true } as WishlistProduct;
    const variantFromIds = { ...family, name: "Kit Básico de apuntes Girly Naranja", isGroup: false, variantCount: undefined, stock: 0, price: 18000 } as unknown as Product;
    const freshFamily = { ...family, id: "v-azul", slug: "kit-basico-girly-azul", name: "Kits Básicos de apuntes", stock: 5, price: 17000, minPrice: 17000, variantCount: 5 } as unknown as Product;
    const [refreshed] = refreshWishlistItems([stored], [variantFromIds], [freshFamily]);
    expect(refreshed).toMatchObject({
      id: "v-naranja",
      slug: "kit-basico-girly-naranja",
      name: "Kits Básicos de apuntes",
      isGroup: true,
      variantCount: 5,
      stock: 5,
      price: 17000,
      savedAsGroup: true,
      addedOn: new Date("2026-09-20T12:00:00Z"),
    });
  });

  it("sin familia fresca (grupo borrado) se queda con la variante; un producto simple se refresca como siempre", () => {
    const storedFamily = { ...family, addedOn: new Date(), savedAsGroup: true } as WishlistProduct;
    const storedSimple = { ...simple, addedOn: new Date(), savedAsGroup: false } as WishlistProduct;
    const [asVariant, refreshedSimple] = refreshWishlistItems(
      [storedFamily, storedSimple],
      [{ ...family, name: "Kit Básico de apuntes Girly Naranja", isGroup: false } as unknown as Product, { ...simple, stock: 0, price: "4000" } as unknown as Product],
      [],
    );
    expect(asVariant).toMatchObject({ id: "v-naranja", name: "Kit Básico de apuntes Girly Naranja", isGroup: false, savedAsGroup: true });
    expect(refreshedSimple).toMatchObject({ id: "s1", stock: 0, price: "4000", savedAsGroup: false });
  });

  it("el catálogo acepta groups= de ida y de vuelta", () => {
    expect(buildCatalogSearchParams({ groups: "g1,g2" }).get("groups")).toBe("g1,g2");
    expect(parseCatalogSearchParams(new URLSearchParams("groups=g1,g2&ids=a")).groups).toBe("g1,g2");
  });
});
