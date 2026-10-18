import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

vi.mock("@/lib/prismadb", async () => ({ default: (await import("./helpers/database")).testPrisma }));

import { brandStorefrontTarget } from "@/lib/brand-cache";
import { resolvePublicBrandIds } from "@/lib/brand-catalog";
import { findPublicBrand, listPublicBrands } from "@/lib/brand-public";
import { applyBrandInitialPlan, loadBrandInitialPlan, type BrandInitialConfig } from "@/lib/brand-initial-data";
import { applyMercadoLibreBrandPlan, loadMercadoLibreBrandPlan, type MercadoLibreBrandConfig } from "@/lib/brand-mercadolibre-mapping";
import {
  assignBrandToProducts,
  changeBrandSlug,
  createBrand,
  deleteBrand,
  getBrandSuggestions,
  mergeBrands,
  setBrandArchived,
  updateBrand,
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
  parentBrandId: null as string | null,
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
  await testPrisma.marketplaceListing.deleteMany({ where: { connection: { storeId } } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { storeId } });
  await testPrisma.product.deleteMany({ where: { id: { in: created } } });
  await testPrisma.productGroup.deleteMany({ where: { storeId } });
  await testPrisma.brandSlugRedirect.deleteMany({ where: { storeId } });
  // Las líneas primero: una madre con líneas no se puede borrar (Restrict).
  await testPrisma.brand.updateMany({ where: { storeId }, data: { parentBrandId: null } });
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
    const klipp = await createBrand(fixture.store.id, "user", input("Klipp Prueba", { aliases: ["Fashion Prueba"] }));
    const other = await createBrand(fixture.store.id, "user", input("Otra Prueba"));
    const clean = await product("Morral Fashion Prueba estampado");
    const conflict = await product("Cartuchera Klipp Prueba");
    await testPrisma.product.update({ where: { id: conflict.id }, data: { brandId: other.id } });
    await product("Morral Fashion Prueba viejo", { isArchived: true });
    const suggestions = await getBrandSuggestions(fixture.store.id, klipp.id);
    expect(suggestions.clean.map((row) => [row.id, row.reason])).toEqual([[clean.id, "coincide por el alias «Fashion Prueba»"]]);
    expect(suggestions.conflicts.map((row) => [row.id, row.currentBrandName])).toEqual([[conflict.id, "Otra Prueba"]]);
  });

  it("líneas: un solo nivel, y la madre con líneas no se archiva, no se borra ni se fusiona en su línea", async () => {
    const madre = await createBrand(fixture.store.id, "user", input("Madre Línea"));
    const linea = await createBrand(fixture.store.id, "user", input("Hija Línea", { parentBrandId: madre.id }));
    expect(linea.parentBrandId).toBe(madre.id);
    await expect(createBrand(fixture.store.id, "user", input("Nieta Línea", { parentBrandId: linea.id }))).rejects.toThrow(/ya es una línea/);
    await expect(updateBrand(fixture.store.id, madre.id, input("Madre Línea", { parentBrandId: madre.id }))).rejects.toThrow(/sí misma/);
    const otra = await createBrand(fixture.store.id, "user", input("Otra Madre Línea"));
    await expect(updateBrand(fixture.store.id, madre.id, input("Madre Línea", { parentBrandId: otra.id }))).rejects.toThrow(/tiene líneas/);
    await expect(setBrandArchived(fixture.store.id, madre.id, true)).rejects.toThrow(/líneas sin archivar/);
    await expect(mergeBrands(fixture.store.id, madre.id, linea.id, { copyLogo: false }, testPrisma)).rejects.toThrow(/una de sus líneas/);
    await expect(deleteBrand(fixture.store.id, madre.id)).rejects.toThrow(/Tiene líneas/);

    // Fusionar la madre en otra marca de primer nivel: sus líneas pasan a la otra.
    await mergeBrands(fixture.store.id, madre.id, otra.id, { copyLogo: false }, testPrisma);
    expect((await testPrisma.brand.findUnique({ where: { id: linea.id } }))?.parentBrandId).toBe(otra.id);
  });

  it("elegir la madre trae sus líneas; su página cuenta y lista las líneas; sugiere la línea, no la madre", async () => {
    const madre = await createBrand(fixture.store.id, "user", input("Madre Catálogo"));
    const linea = await createBrand(fixture.store.id, "user", input("Linea Catalogo", { parentBrandId: madre.id }));
    const propio = await product("Block Madre Catálogo");
    const deLinea = await product("Libreta Linea Catalogo");
    await testPrisma.product.update({ where: { id: propio.id }, data: { brandId: madre.id } });
    await testPrisma.product.update({ where: { id: deLinea.id }, data: { brandId: linea.id } });

    expect((await resolvePublicBrandIds(fixture.store.id, [madre.slug])).sort()).toEqual([madre.id, linea.id].sort());
    expect(await resolvePublicBrandIds(fixture.store.id, [linea.slug])).toEqual([linea.id]);

    const page = await findPublicBrand(fixture.store.id, madre.slug);
    expect(page.kind).toBe("brand");
    if (page.kind === "brand") {
      expect(page.brand.productCount).toBe(2);
      expect(page.brand.lines.map((line) => [line.slug, line.productCount])).toEqual([[linea.slug, 1]]);
      expect(page.brand.parent).toBeNull();
    }
    const linePage = await findPublicBrand(fixture.store.id, linea.slug);
    if (linePage.kind === "brand") expect(linePage.brand.parent).toEqual({ name: "Madre Catálogo", slug: madre.slug });

    const sinMarca = await product("Agenda Madre Catálogo Linea Catalogo");
    const madreSugiere = await getBrandSuggestions(fixture.store.id, madre.id);
    expect(madreSugiere.clean.map((row) => row.id)).not.toContain(sinMarca.id);
    const lineaSugiere = await getBrandSuggestions(fixture.store.id, linea.id);
    expect(lineaSugiere.clean.map((row) => row.id)).toContain(sinMarca.id);
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
      brands: [
        { name: "Inicial Línea", parent: "Inicial Uno" },
        { name: "Inicial Uno", aliases: ["Alias Inicial"] },
        { name: "Inicial Oculta", isVisible: false },
      ],
      textMapping: { "Texto Inicial": { brand: "Inicial Uno" } },
    };
    const byText = await product("Libreta lisa", { brand: "texto inicial" });
    const byAlias = await product("Cuaderno Alias Inicial");
    const plan = await loadBrandInitialPlan(testPrisma, config, normalizeBrandName);
    expect(plan.createBrands.map((brand) => brand.name)).toEqual(["Inicial Uno", "Inicial Oculta", "Inicial Línea"]);
    // Las marcas que dejaron las pruebas anteriores también sugieren: aquí solo se miran estos dos.
    expect(plan.productAssignments.filter((row) => [byText.id, byAlias.id].includes(row.productId))).toEqual(
      expect.arrayContaining([
        { productId: byText.id, brand: "Inicial Uno", via: "texto anterior" },
        { productId: byAlias.id, brand: "Inicial Uno", via: "nombre o alias" },
      ]),
    );
    const result = await testPrisma.$transaction((tx) => applyBrandInitialPlan(tx, config, normalizeBrandName, plan, plan.rows, "test"));
    expect(result.written).toBe(plan.rows);
    expect((await testPrisma.brand.findFirst({ where: { storeId: fixture.store.id, name: "Inicial Línea" } }))?.parentBrandId).toBe(
      (await testPrisma.brand.findFirst({ where: { storeId: fixture.store.id, name: "Inicial Uno" } }))?.id,
    );
    expect((await testPrisma.brand.findFirst({ where: { storeId: fixture.store.id, name: "Inicial Oculta" } }))?.isVisible).toBe(false);
    const again = await loadBrandInitialPlan(testPrisma, config, normalizeBrandName);
    expect(again.rows).toBe(0);
    await expect(
      testPrisma.$transaction((tx) => applyBrandInitialPlan(tx, config, normalizeBrandName, plan, plan.rows, "test")),
    ).rejects.toThrow(/El plan cambió/);
  });

  it("marcas desde Mercado Libre: crea la oculta, asigna el grupo entero y una publicación cambiada invalida el plan", async () => {
    const storeId = fixture.store.id;
    const connection = await testPrisma.marketplaceConnection.create({ data: { storeId, provider: "MERCADOLIBRE", status: "CONNECTED" } });
    const group = await testPrisma.productGroup.create({ data: { storeId, name: "Grupo ML", description: "" } });
    const listed = await product("Variante listada", { productGroupId: group.id });
    const sibling = await product("Variante hermana", { productGroupId: group.id });
    const generic = await product("Producto genérico");
    const item = (externalItemId: string, productId: string) =>
      testPrisma.marketplaceListing.create({ data: { connectionId: connection.id, productId, externalItemId, status: "ACTIVE" } });
    await item("MCO-T1", listed.id);
    await item("MCO-T2", generic.id);
    const config: MercadoLibreBrandConfig = {
      storeId,
      brands: [{ name: "Marca ML Oculta", isVisible: false }],
      valueMapping: { "Marca ML Oculta": { brand: "Marca ML Oculta" }, "Genérica": { none: true } },
    };
    const listings = [
      { externalItemId: "MCO-T1", productId: listed.id, mlBrand: "Marca ML Oculta" },
      { externalItemId: "MCO-T2", productId: generic.id, mlBrand: "Genérica" },
    ];
    const plan = await loadMercadoLibreBrandPlan(testPrisma, config, listings);
    expect(plan.createBrands.map((brand) => [brand.name, brand.isVisible])).toEqual([["Marca ML Oculta", false]]);
    expect(plan.productAssignments.map((row) => [row.productId, row.via])).toEqual(
      [
        [listed.id, "BRAND de Mercado Libre"],
        [sibling.id, "grupo"],
      ].sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    expect(plan.rows).toBe(4);

    // Una publicación pausada desde el ensayo: no se escribe nada.
    await testPrisma.marketplaceListing.updateMany({ where: { externalItemId: "MCO-T1" }, data: { status: "PAUSED" } });
    await expect(testPrisma.$transaction((tx) => applyMercadoLibreBrandPlan(tx, config, listings, plan, plan.rows, "test"))).rejects.toThrow(
      /ya no está activa/,
    );
    expect(await testPrisma.brand.count({ where: { storeId, name: "Marca ML Oculta" } })).toBe(0);
    await testPrisma.marketplaceListing.updateMany({ where: { externalItemId: "MCO-T1" }, data: { status: "ACTIVE" } });

    const result = await testPrisma.$transaction((tx) => applyMercadoLibreBrandPlan(tx, config, listings, plan, plan.rows, "test"));
    expect(result.written).toBe(4);
    const brand = await testPrisma.brand.findFirstOrThrow({ where: { storeId, name: "Marca ML Oculta" } });
    expect(brand.isVisible).toBe(false);
    expect((await testPrisma.productGroup.findUniqueOrThrow({ where: { id: group.id } })).brandId).toBe(brand.id);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: generic.id } })).brandId).toBeNull();
    expect((await loadMercadoLibreBrandPlan(testPrisma, config, listings)).rows).toBe(0);
  });
});
