import { describe, expect, it } from "vitest";

import {
  BRAND_PAGE_INDEX_MIN_PRODUCTS,
  brandDataName,
  brandLogoUrl,
  brandToggleHref,
  canShowBrandLogo,
  getBrandPageState,
  joinBrandNames,
  parseBrandParam,
  publicProductBrand,
  topLevelBrandName,
} from "@/lib/brand-display";
import type { Product, PublicBrand } from "@/types";

const LOGO = "https://res.cloudinary.com/demo/logo.png";
const brand = (overrides: Partial<PublicBrand> = {}): PublicBrand => ({
  name: "Marca de prueba",
  slug: "marca-de-prueba",
  logoUrl: LOGO,
  logoHasBackground: false,
  logoPermission: "ALLOWED",
  color: null,
  isPublic: true,
  parent: null,
  ...overrides,
});
const product = (overrides: Partial<Product>) => overrides as Pick<Product, "brand" | "productGroup">;

describe("regla del logo", () => {
  it.each([
    ["ALLOWED", true],
    ["UNKNOWN", true],
    ["PENDING", false],
    ["DENIED", false],
  ] as const)("con permiso %s el logo se ve: %s", (logoPermission, visible) => {
    expect(canShowBrandLogo(brand({ logoPermission }))).toBe(visible);
    expect(brandLogoUrl(brand({ logoPermission }))).toBe(visible ? LOGO : null);
  });

  it("sin logo va el nombre, aunque el permiso esté confirmado", () => {
    expect(canShowBrandLogo(brand({ logoUrl: null }))).toBe(false);
    expect(canShowBrandLogo(null)).toBe(false);
  });
});

describe("regla de visibilidad", () => {
  it("la interfaz solo ve marcas públicas; los datos ven también las ocultas", () => {
    expect(publicProductBrand(product({ brand: brand() }))?.slug).toBe("marca-de-prueba");
    expect(publicProductBrand(product({ brand: brand({ isPublic: false }) }))).toBeNull();
    expect(brandDataName(product({ brand: brand({ isPublic: false }) }))).toBe("Marca de prueba");
  });

  it("JSON-LD lleva la marca madre de una línea, también si la madre está oculta; GA4 sigue con la línea", () => {
    const line = brand({ name: "Flower Power", slug: "flower-power", parent: { name: "Primavera", slug: "primavera", isPublic: false } });
    expect(topLevelBrandName(product({ brand: line }))).toBe("Primavera");
    expect(brandDataName(product({ brand: line }))).toBe("Flower Power");
    expect(topLevelBrandName(product({ brand: brand() }))).toBe("Marca de prueba");
    expect(topLevelBrandName(product({ brand: null }))).toBeUndefined();
  });

  it("usa la marca del grupo cuando el producto no trae una", () => {
    const grouped = product({ brand: null, productGroup: { id: "g", name: "Grupo", brand: brand() } });
    expect(publicProductBrand(grouped)?.name).toBe("Marca de prueba");
  });

  it("nunca usa el texto viejo de marca", () => {
    const legacy = product({ brand: "Texto viejo" as unknown as PublicBrand });
    expect(publicProductBrand(legacy)).toBeNull();
    expect(brandDataName(legacy)).toBeUndefined();
  });
});

describe("parámetro marca", () => {
  it("limpia vacíos y repetidos", () => {
    expect(parseBrandParam("kiut, norma,,kiut")).toEqual(["kiut", "norma"]);
    expect(parseBrandParam(["kiut", "norma"])).toEqual(["kiut", "norma"]);
    expect(parseBrandParam(undefined)).toEqual([]);
  });

  it("un chip suma o quita su marca, conserva los demás filtros y vuelve a la página 1", () => {
    expect(brandToggleHref("/tienda", {}, "kiut")).toBe("/tienda?marca=kiut");
    expect(brandToggleHref("/tienda", { marca: "kiut", page: "3", colorId: "c1" }, "norma")).toBe("/tienda?colorId=c1&marca=kiut,norma");
    expect(brandToggleHref("/tienda", { marca: "kiut", sortOption: "priceAsc" }, "kiut")).toBe("/tienda?sortOption=priceAsc");
    expect(brandToggleHref("/tienda", { marca: "kiut" }, "kiut")).toBe("/tienda");
  });

  it("nombra varias marcas en español", () => {
    expect(joinBrandNames(["Kiut"])).toBe("Kiut");
    expect(joinBrandNames(["Kiut", "Norma"])).toBe("Kiut y Norma");
    expect(joinBrandNames(["Kiut", "Norma", "Scribe"])).toBe("Kiut, Norma y Scribe");
  });
});

describe("página de la marca", () => {
  it("sin productos muestra el estado vacío (noindex)", () => {
    expect(getBrandPageState(0, 0)).toEqual({ kind: "empty" });
    expect(getBrandPageState(5, 0)).toEqual({ kind: "empty" });
  });

  it("se indexa desde el umbral", () => {
    expect(BRAND_PAGE_INDEX_MIN_PRODUCTS).toBe(3);
    expect(getBrandPageState(BRAND_PAGE_INDEX_MIN_PRODUCTS - 1, 2)).toEqual({ kind: "products", index: false });
    expect(getBrandPageState(BRAND_PAGE_INDEX_MIN_PRODUCTS, 3)).toEqual({ kind: "products", index: true });
  });
});
