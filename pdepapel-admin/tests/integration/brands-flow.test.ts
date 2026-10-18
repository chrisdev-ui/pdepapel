import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

vi.mock("@/lib/prismadb", async () => ({ default: (await import("./helpers/database")).testPrisma }));

import { brandStorefrontTarget } from "@/lib/brand-cache";
import { findPublicBrand, listPublicBrands } from "@/lib/brand-public";
import { applyBrandInitialPlan, loadBrandInitialPlan, type BrandInitialConfig } from "@/lib/brand-initial-data";
import {
  assignBrandToProducts,
  changeBrandSlug,
  createBrand,
  deleteBrand,
  getBrandSuggestions,
  mergeBrands,
  setBrandArchived,
} from "@/lib/brands";
import { getOrderItemBrandNames } from "@/lib/order-item-brand";
import { normalizeBrandName } from "@/lib/product-naming";

/** Marcas contra MySQL: fusión, direcciones, asignación en grupo, sugerencias y datos iniciales. */
let fixture: InventoryFixture;
const created: string[] = [];

const input = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  aliases: [],
  manufacturerName: null,
  logoUrl: null,
  logoPublicId: null,
  logoWidth: null,
  logoHeight: null,
  logoHasBackground: false,
  logoInverseUrl: null,
  color: null,
  seoText: null,
  website: null,
  logoSourceUrl: null,
  logoPermission: "UNKNOWN" as const,
  isVisible: true,
  isFeatured: false,
  ...extra,
});

async function product(name: string, extra: { productGroupId?: string; isArchived?: boolean; brand?: string } = {}) {
  const row = await testPrisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 8)}`,
      description: "Producto de pruebas",
      stock: 3,
      price: 1000,
      sku: `BRAND-${randomUUID()}`,
      storeId: fixture.store.id,
      categoryId: fixture.category.id,
      colorId: fixture.component.colorId,
      sizeId: fixture.component.sizeId,
      designId: fixture.component.designId,
      ...extra,
    },
  });
  created.push(row.id);
  return row;
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
});

afterAll(async () => {
  const storeId = fixture.store.id;
  await testPrisma.product.deleteMany({ where: { id: { in: created } } });
  await testPrisma.productGroup.deleteMany({ where: { storeId } });
  await testPrisma.brandSlugRedirect.deleteMany({ where: { storeId } });
  await testPrisma.brand.deleteMany({ where: { storeId } });
  await deleteInventoryFixture(fixture);
});

describe("marcas", () => {
  it("cambiar la dirección deja la anterior redirigiendo y volver a ella la recupera", async () => {
    const brand = await createBrand(fixture.store.id, "user", input("Marca Dirección"));
    expect(brand.slug).toBe("marca-direccion");
    const changed = await changeBrandSlug(fixture.store.id, brand.id, "marca-nueva");
    expect(changed).toEqual({ slug: "marca-nueva", previousSlug: "marca-direccion" });
    expect(await findPublicBrand(fixture.store.id, "marca-direccion")).toEqual({ kind: "redirect", slug: "marca-nueva" });
    await changeBrandSlug(fixture.store.id, brand.id, "marca-direccion");
    expect((await findPublicBrand(fixture.store.id, "marca-direccion")).kind).toBe("brand");
    expect(await findPublicBrand(fixture.store.id, "marca-nueva")).toEqual({ kind: "redirect", slug: "marca-direccion" });
  });

  it("asignar a una variante arrastra a todo su grupo", async () => {
    const brand = await createBrand(fixture.store.id, "user", input("Marca Grupo"));
    const group = await testPrisma.productGroup.create({ data: { storeId: fixture.store.id, name: "Grupo", description: "" } });
    const first = await product("Variante uno", { productGroupId: group.id });
    const second = await product("Variante dos", { productGroupId: group.id });
    const result = await assignBrandToProducts(fixture.store.id, brand.id, [first.id], testPrisma);
    expect(result.updatedProducts).toBe(2);
    expect((await testPrisma.productGroup.findUnique({ where: { id: group.id } }))?.brandId).toBe(brand.id);
    expect((await testPrisma.product.findUnique({ where: { id: second.id } }))?.brandId).toBe(brand.id);
  });

  it("sugiere por nombre o alias: sin marca preseleccionados, con otra marca aparte", async () => {
    const scribe = await createBrand(fixture.store.id, "user", input("Scribe Prueba", { aliases: ["Incolors Prueba"] }));
    const other = await createBrand(fixture.store.id, "user", input("Otra Prueba"));
    const clean = await product("Cuaderno Incolors Prueba tapa dura");
    const conflict = await product("Colores Scribe Prueba x15");
    await testPrisma.product.update({ where: { id: conflict.id }, data: { brandId: other.id } });
    await product("Cuaderno Incolors Prueba viejo", { isArchived: true });
    const suggestions = await getBrandSuggestions(fixture.store.id, scribe.id);
    expect(suggestions.clean.map((row) => [row.id, row.reason])).toEqual([[clean.id, "coincide por el alias «Incolors Prueba»"]]);
    expect(suggestions.conflicts.map((row) => [row.id, row.currentBrandName])).toEqual([[conflict.id, "Otra Prueba"]]);
  });

  it("fusiona A en B: productos, direcciones, alias, logo opcional y A archivada", async () => {
    const source = await createBrand(fixture.store.id, "user", input("Marca A", { aliases: ["Alias A"], logoUrl: "https://res.cloudinary.com/demo/image/upload/v1/a.png" }));
    const target = await createBrand(fixture.store.id, "user", input("Marca B"));
    await changeBrandSlug(fixture.store.id, source.id, "marca-a-nueva");
    const moved = await product("Producto de A");
    await testPrisma.product.update({ where: { id: moved.id }, data: { brandId: source.id } });

    const summary = await mergeBrands(fixture.store.id, source.id, target.id, { copyLogo: true }, testPrisma);
    expect(summary).toMatchObject({ movedProducts: 1, copiedLogo: true });
    expect(summary.addedAliases.sort()).toEqual(["Alias A", "Marca A"]);
    expect(summary.redirects.sort()).toEqual(["marca-a", "marca-a-nueva"]);
    expect((await testPrisma.product.findUnique({ where: { id: moved.id } }))?.brandId).toBe(target.id);
    const [sourceAfter, targetAfter] = await Promise.all([
      testPrisma.brand.findUnique({ where: { id: source.id } }),
      testPrisma.brand.findUnique({ where: { id: target.id } }),
    ]);
    expect(sourceAfter?.isArchived).toBe(true);
    expect(targetAfter?.logoUrl).toBe("https://res.cloudinary.com/demo/image/upload/v1/a.png");
    expect(await findPublicBrand(fixture.store.id, "marca-a-nueva")).toEqual({ kind: "redirect", slug: "marca-b" });
    await expect(setBrandArchived(fixture.store.id, source.id, false)).rejects.toThrow(/se fusionó/);
  });

  it("no borra una marca con productos; sin productos sí", async () => {
    const used = await createBrand(fixture.store.id, "user", input("Marca Usada"));
    const p = await product("Producto usado");
    await testPrisma.product.update({ where: { id: p.id }, data: { brandId: used.id } });
    await expect(deleteBrand(fixture.store.id, used.id)).rejects.toThrow(/no se puede eliminar/);
    const empty = await createBrand(fixture.store.id, "user", input("Marca Vacía"));
    await expect(deleteBrand(fixture.store.id, empty.id)).resolves.toMatchObject({ id: empty.id });
  });

  it("la lista pública trae solo visibles y sin archivar, con productos activos", async () => {
    const hidden = await createBrand(fixture.store.id, "user", input("Marca Oculta", { isVisible: false }));
    const visible = await createBrand(fixture.store.id, "user", input("Marca Visible"));
    const p = await product("Producto visible");
    await testPrisma.product.update({ where: { id: p.id }, data: { brandId: visible.id } });
    const all = await listPublicBrands(fixture.store.id);
    expect(all.some((brand) => brand.id === hidden.id)).toBe(false);
    const withProducts = await listPublicBrands(fixture.store.id, { withProducts: true });
    expect(withProducts.find((brand) => brand.id === visible.id)?.productCount).toBe(1);
    expect((await findPublicBrand(fixture.store.id, hidden.slug)).kind).toBe("missing");
  });

  it("la purga de una marca nombra su lista, sus páginas y sus productos", async () => {
    const brand = await createBrand(fixture.store.id, "user", input("Marca Purga"));
    const p = await product("Producto purga");
    await testPrisma.product.update({ where: { id: p.id }, data: { brandId: brand.id } });
    await changeBrandSlug(fixture.store.id, brand.id, "marca-purga-nueva");
    const target = await brandStorefrontTarget(fixture.store.id, { brandIds: [brand.id] });
    expect(target.productIds).toEqual([p.id]);
    expect(target.extra?.tags).toEqual(expect.arrayContaining(["brands", "products:list", "brand:marca-purga-nueva", "brand:marca-purga"]));
    expect(target.extra?.paths).toEqual(expect.arrayContaining(["/marcas", "/marcas/marca-purga-nueva", "/marcas/marca-purga"]));
  });

  it("la línea del pedido guarda la marca del producto o de su grupo, nunca una archivada", async () => {
    const brand = await createBrand(fixture.store.id, "user", input("Marca Pedido"));
    const archived = await createBrand(fixture.store.id, "user", input("Marca Pedido Vieja"));
    await setBrandArchived(fixture.store.id, archived.id, true);
    const group = await testPrisma.productGroup.create({ data: { storeId: fixture.store.id, name: "Grupo pedido", description: "", brandId: brand.id } });
    const inGroup = await product("Variante pedido", { productGroupId: group.id });
    const old = await product("Producto marca vieja");
    await testPrisma.product.update({ where: { id: old.id }, data: { brandId: archived.id } });
    const names = await getOrderItemBrandNames(testPrisma, [inGroup.id, old.id, null]);
    expect(names.get(inGroup.id)).toBe("Marca Pedido");
    expect(names.get(old.id)).toBeNull();
  });

  it("datos iniciales: el ensayo y la escritura dan lo mismo y una segunda corrida no encuentra nada", async () => {
    const config: BrandInitialConfig = {
      storeId: fixture.store.id,
      brands: [{ name: "Inicial Uno", aliases: ["Alias Inicial"] }],
      textMapping: { "Texto Inicial": { brand: "Inicial Uno" } },
    };
    const byText = await product("Libreta lisa", { brand: "texto inicial" });
    const byAlias = await product("Cuaderno Alias Inicial");
    const plan = await loadBrandInitialPlan(testPrisma, config, normalizeBrandName);
    expect(plan.createBrands.map((brand) => brand.name)).toEqual(["Inicial Uno"]);
    // Las marcas que dejaron las pruebas anteriores también sugieren: aquí solo se miran estos dos.
    expect(plan.productAssignments.filter((row) => [byText.id, byAlias.id].includes(row.productId))).toEqual(
      expect.arrayContaining([
        { productId: byText.id, brand: "Inicial Uno", via: "texto anterior" },
        { productId: byAlias.id, brand: "Inicial Uno", via: "nombre o alias" },
      ]),
    );
    const result = await testPrisma.$transaction((tx) => applyBrandInitialPlan(tx, config, normalizeBrandName, plan, plan.rows, "test"));
    expect(result.written).toBe(plan.rows);
    const again = await loadBrandInitialPlan(testPrisma, config, normalizeBrandName);
    expect(again.rows).toBe(0);
    await expect(
      testPrisma.$transaction((tx) => applyBrandInitialPlan(tx, config, normalizeBrandName, plan, plan.rows, "test")),
    ).rejects.toThrow(/El plan cambió/);
  });
});
