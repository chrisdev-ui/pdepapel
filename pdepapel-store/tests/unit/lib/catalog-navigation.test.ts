import { describe, expect, it } from "vitest";

import { formatCop, stripTaxonomyIcon } from "@/lib/catalog-labels";
import {
  buildFeaturedByType,
  buildNavigationTypes,
} from "@/lib/catalog-navigation";
import { resolveTypeIcon } from "@/lib/type-icons";
import type { Category, Product, Type } from "@/types";

describe("stripTaxonomyIcon", () => {
  it("removes a leading emoji or symbol and keeps accented names intact", () => {
    expect(stripTaxonomyIcon("🎨 Creatividad & Juego")).toBe("Creatividad & Juego");
    expect(stripTaxonomyIcon("✏️ Lápices & Colores")).toBe("Lápices & Colores");
    expect(stripTaxonomyIcon("🗓️ Planeación & Organización")).toBe(
      "Planeación & Organización",
    );
    expect(stripTaxonomyIcon("Útiles")).toBe("Útiles");
    expect(stripTaxonomyIcon("  Cuadernos ")).toBe("Cuadernos");
    expect(stripTaxonomyIcon(null)).toBe("");
  });
});

describe("formatCop", () => {
  it("formats pesos the way the store prints prices", () => {
    expect(formatCop(120000)).toBe("$ 120.000");
    expect(formatCop(50000)).toBe("$ 50.000");
  });
});

describe("resolveTypeIcon", () => {
  it("prefers an explicit Lucide name, then slug/name keywords, then a neutral tag", () => {
    expect(resolveTypeIcon({ icon: "gift", name: "Cualquiera" }).displayName).toBe("Gift");
    expect(resolveTypeIcon({ slug: "escritura", name: "🖊️ Escritura" }).displayName).toBe("PenLine");
    expect(resolveTypeIcon({ slug: "lapices-colores", name: "Lápices & Colores" }).displayName).toBe("Pencil");
    expect(resolveTypeIcon({ name: "Planeación & Organización" }).displayName).toBe("CalendarDays");
    expect(resolveTypeIcon({ name: "Bolsos & Morrales" }).displayName).toBe("Backpack");
    expect(resolveTypeIcon({ name: "Belleza / Cuidado personal" }).displayName).toBe("Flower");
    expect(resolveTypeIcon({ name: "Algo nuevo" }).displayName).toBe("Tag");
  });
});

const types = [
  { id: "t-esc", name: "🖊️ Escritura", slug: "escritura", categories: [] },
  { id: "t-cua", name: "📒 Cuadernos", slug: "cuadernos", categories: [] },
  { id: "t-emp", name: "Vacío", slug: "vacio", categories: [] },
] as Type[];
const categories = [
  { id: "c1", typeId: "t-esc", name: "Resaltadores", slug: "resaltadores" },
  { id: "c2", typeId: "t-esc", name: "Bolígrafos / Lapiceros", slug: "boligrafos" },
  { id: "c3", typeId: "t-cua", name: "Argollados", slug: "argollados" },
] as Category[];

describe("buildNavigationTypes", () => {
  it("cleans labels, attaches sorted subcategories, and follows the merchandising order", () => {
    const navigation = buildNavigationTypes(types, categories);

    expect(navigation.map((type) => type.label)).toEqual([
      "Cuadernos",
      "Escritura",
      "Vacío",
    ]);
    expect(navigation[1].subcategories.map((c) => c.name)).toEqual([
      "Bolígrafos / Lapiceros",
      "Resaltadores",
    ]);
    expect(navigation[2].subcategories).toEqual([]);
  });
});

describe("buildFeaturedByType", () => {
  const product = (overrides: Partial<Product>) =>
    ({
      id: "p",
      name: "Producto",
      slug: "producto",
      price: "10000",
      stock: 2,
      isFeatured: true,
      images: [{ id: "i", url: "https://img/1.png" }],
      category: { id: "c", name: "Cat", typeId: "t-esc" },
      ...overrides,
    }) as unknown as Product;

  it("keeps the first featured, in-stock product with a photo per type", () => {
    const result = buildFeaturedByType([
      product({ id: "no-stock", stock: 0 }),
      product({ id: "no-photo", images: [] }),
      product({ id: "not-featured", isFeatured: false }),
      product({ id: "winner", name: "Marcadores", price: "50000" }),
      product({ id: "second", name: "Otro" }),
      product({ id: "other-type", category: { id: "c2", name: "X", typeId: "t-cua" } }),
    ]);

    expect(Object.keys(result)).toEqual(["t-esc", "t-cua"]);
    expect(result["t-esc"]).toEqual({
      id: "winner",
      slug: "producto",
      name: "Marcadores",
      price: 50000,
      imageUrl: "https://img/1.png",
    });
  });
});
