import { describe, expect, it } from "vitest";

import { buildCategoryBreadcrumbs, buildShopBreadcrumbs } from "@/lib/shop-breadcrumbs";

const types = [{ id: "t1", name: "✏️ Escritura", slug: "escritura" }];
const categories = [
  { id: "c1", name: "Lápices", slug: "lapices", typeId: "t1" },
  { id: "c2", name: "Bolígrafos / Lapiceros", slug: "boligrafos-lapiceros", typeId: "t1" },
  { id: "c3", name: "Notas & stickers", slug: null, typeId: "t9" },
];

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

  it("una subcategoría elegida enlaza su tipo y su página, por slug y nunca por el nombre", () => {
    const expected = [
      { label: "Tienda", href: "/tienda", isCurrent: false },
      { label: "Escritura", href: "/tienda?typeId=t1", isCurrent: false },
      { label: "Bolígrafos / Lapiceros", href: "/categoria/boligrafos-lapiceros", isCurrent: false },
    ];
    expect(buildShopBreadcrumbs({ typeId: ["t1"], categoryId: ["c2"], search: "" }, types, categories)).toEqual(expected);
    expect(buildShopBreadcrumbs({ typeId: [], categoryId: ["boligrafos-lapiceros"], search: "" }, types, categories)).toEqual(expected);
  });

  it("sin slug, la subcategoría enlaza por id (la página redirige al slug); sin tipo conocido, no inventa la miga", () => {
    expect(buildShopBreadcrumbs({ typeId: [], categoryId: ["c3"], search: "" }, types, categories)).toEqual([
      { label: "Tienda", href: "/tienda", isCurrent: false },
      { label: "Notas & stickers", href: "/categoria/c3", isCurrent: false },
    ]);
  });

  it("varios tipos a la vez no inventan una miga", () => {
    expect(buildShopBreadcrumbs({ typeId: ["t1", "t2"], categoryId: [], search: "" }, types, categories)).toHaveLength(1);
  });

  it("una búsqueda", () => {
    expect(buildShopBreadcrumbs({ typeId: [], categoryId: [], search: "gato" }, types, categories).at(-1)).toEqual({ label: "Resultados: gato", isCurrent: true });
  });
});

describe("buildCategoryBreadcrumbs", () => {
  it("Tienda › tipo › subcategoría; el tipo enlaza por id y la subcategoría es la página actual", () => {
    expect(buildCategoryBreadcrumbs({ name: "Bolígrafos / Lapiceros" }, types[0])).toEqual([
      { label: "Tienda", href: "/tienda", isCurrent: false },
      { label: "Escritura", href: "/tienda?typeId=t1", isCurrent: false },
      { label: "Bolígrafos / Lapiceros", isCurrent: true },
    ]);
  });

  it("sin tipo conocido, solo Tienda › subcategoría", () => {
    expect(buildCategoryBreadcrumbs({ name: "✏️ Lápices" }, undefined)).toEqual([
      { label: "Tienda", href: "/tienda", isCurrent: false },
      { label: "Lápices", isCurrent: true },
    ]);
  });
});
