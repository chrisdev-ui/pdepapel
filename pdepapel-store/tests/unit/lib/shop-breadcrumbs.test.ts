import { describe, expect, it } from "vitest";

import { buildShopBreadcrumbs } from "@/lib/shop-breadcrumbs";

const types = [{ id: "t1", name: "✏️ Escritura", slug: "escritura" }];
const categories = [{ id: "c1", name: "Lápices", slug: "lapices" }];

describe("buildShopBreadcrumbs", () => {
  it("sin filtros: solo «Tienda»", () => {
    expect(buildShopBreadcrumbs({ typeId: [], categoryId: [], search: "" }, types, categories)).toEqual([
      { label: "Tienda", href: "/tienda", isCurrent: true },
    ]);
  });

  it("un tipo elegido, por id o por slug", () => {
    const expected = [
      { label: "Tienda", href: "/tienda", isCurrent: false },
      { label: "Escritura", isCurrent: true },
    ];
    expect(buildShopBreadcrumbs({ typeId: ["t1"], categoryId: [], search: "" }, types, categories)).toEqual(expected);
    expect(buildShopBreadcrumbs({ typeId: ["escritura"], categoryId: [], search: "" }, types, categories)).toEqual(expected);
  });

  it("la subcategoría gana sobre el tipo", () => {
    expect(buildShopBreadcrumbs({ typeId: ["t1"], categoryId: ["c1"], search: "" }, types, categories).at(-1)).toEqual({ label: "Lápices", isCurrent: true });
  });

  it("varios tipos a la vez no inventan una miga", () => {
    expect(buildShopBreadcrumbs({ typeId: ["t1", "t2"], categoryId: [], search: "" }, types, categories)).toHaveLength(1);
  });

  it("una búsqueda", () => {
    expect(buildShopBreadcrumbs({ typeId: [], categoryId: [], search: "gato" }, types, categories).at(-1)).toEqual({ label: "Resultados: gato", isCurrent: true });
  });
});
