import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const seo = { seoEnabled: true, seoFeatured: true, seoTitle: "Título SEO", seoDescription: "Descripción SEO", seoIntro: "Intro SEO larga", imageUrl: "https://res.cloudinary.com/x/cat.jpg", icon: "book" };
const categories = [
  { id: "c1", typeId: "t1", name: "Cuadernos", slug: "cuadernos", productCount: 4, ...seo },
  { id: "c2", typeId: "t1", name: "Agendas", slug: "agendas", productCount: 2, ...seo },
];
const types = [{ id: "t1", name: "Papelería", slug: "papeleria", icon: "pen", iconSvg: null, categories }];

vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));
vi.mock("@/lib/public-env", async () => ({ publicEnv: (await import("@/lib/env.mjs")).env }));
vi.mock("@/actions/get-category", () => ({ getCategory: vi.fn(async () => categories[0]) }));
vi.mock("@/actions/get-categories", () => ({ getCategories: vi.fn(async () => categories) }));
vi.mock("@/actions/get-types", () => ({ getTypes: vi.fn(async () => types) }));
vi.mock("@/actions/get-catalog-options", () => ({ getCatalogOptions: vi.fn(async () => []) }));
vi.mock("@/actions/get-colors", () => ({ getColors: vi.fn(async () => []) }));
vi.mock("@/actions/get-designs", () => ({ getDesigns: vi.fn(async () => []) }));
vi.mock("@/actions/get-brands", () => ({ getBrands: vi.fn(async () => []), getBrand: vi.fn() }));
vi.mock("@/actions/get-products", () => ({ getProducts: vi.fn(async () => ({ products: [], totalPages: 1, totalItems: 0 })) }));

import CategoryPage from "@/app/(routes)/categoria/[slug]/page";
import { ShopHeaderNav } from "@/app/(routes)/tienda/components/shop-header-nav";
import ShopPage from "@/app/(routes)/tienda/page";
import { CategoryChips } from "@/components/category-chips";
import { ShopContent } from "@/components/shop-content";

const CLIENT_BOUNDARY = new Map<unknown, string>([
  [ShopContent, "ShopContent"],
  [ShopHeaderNav, "ShopHeaderNav"],
  [CategoryChips, "CategoryChips"],
]);

/**
 * Recorre el árbol que devuelve la página. Los componentes de servidor
 * asíncronos se ejecutan (así aparece el contenido detrás de `Suspense`); en
 * los de cliente se guardan las props, que es lo que viaja en el HTML.
 */
async function clientProps(node: ReactNode, found: Array<{ name: string; props: Record<string, unknown> }> = []) {
  if (Array.isArray(node)) {
    for (const child of node) await clientProps(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const element = node as ReactElement<Record<string, unknown>>;
  const name = CLIENT_BOUNDARY.get(element.type);
  if (name) {
    found.push({ name, props: element.props });
    return found;
  }
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    const rendered: unknown = await (element.type as (props: unknown) => Promise<unknown>)(element.props);
    await clientProps(rendered as ReactNode, found);
    return found;
  }
  for (const value of Object.values(element.props)) await clientProps(value as ReactNode, found);
  return found;
}

const keysDeep = (value: unknown, keys = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, keys));
  else if (value && typeof value === "object" && !isValidElement(value)) {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      keysDeep(child, keys);
    }
  }
  return keys;
};

const shop = () => ShopPage({ searchParams: {} } as unknown as Parameters<typeof ShopPage>[0]);
const category = () => CategoryPage({ params: { slug: "cuadernos" }, searchParams: {} } as unknown as Parameters<typeof CategoryPage>[0]);

/**
 * Las props de los componentes de cliente se serializan en cada respuesta. El
 * registro completo de las categorías (textos SEO, imagen) pesaba ~150 KB de
 * HTML en /tienda sin que los filtros lo leyeran.
 */
describe("listing pages send only what the client components read", () => {
  it.each([
    ["/tienda", shop, ["ShopHeaderNav", "ShopContent"]],
    ["/categoria", category, ["CategoryChips", "ShopContent"]],
  ])("%s: no seo*, imageUrl, productCount or nested categories in client props", async (_route, render, expected) => {
    const found = await clientProps(await render());
    expect(found.map((entry) => entry.name)).toEqual(expect.arrayContaining(expected));
    for (const { name, props } of found) {
      const keys = Array.from(keysDeep(props));
      expect(keys.filter((key) => /^seo/.test(key)), name).toEqual([]);
      expect(keys, name).not.toContain("imageUrl");
      expect(keys, name).not.toContain("productCount");
      expect(JSON.stringify(props), name).not.toContain("Intro SEO larga");
    }
  });

  it.each([
    ["/tienda", shop],
    ["/categoria", category],
  ])("%s: ShopContent gets types as {id, name, slug} and categories as {id, typeId, name, slug}", async (_route, render) => {
    const found = await clientProps(await render());
    const { props } = found.find((entry) => entry.name === "ShopContent")!;
    for (const type of props.types as object[]) expect(Object.keys(type).sort()).toEqual(["id", "name", "slug"]);
    for (const item of props.categories as object[]) expect(Object.keys(item).sort()).toEqual(["id", "name", "slug", "typeId"]);
    expect((props.categories as object[]).length).toBeGreaterThan(0);
  });
});
