import { describe, expect, it } from "vitest";

import {
  brandDataName,
  brandParentError,
  canShowBrandLogo,
  checkBrandColor,
  isBrandPublic,
  normalizeBrandAliases,
  placeLinesAfterParents,
  readStoredAliases,
  topLevelBrandName,
} from "@/lib/brand-rules";
import { toPublicBrand } from "@/lib/public-brand";

const brand = {
  name: "Marca A",
  slug: "marca-a",
  logoUrl: "https://res.cloudinary.com/demo/image/upload/v1/logo.png",
  logoHasBackground: false,
  logoPermission: "ALLOWED" as const,
  color: null,
  isVisible: true,
  isArchived: false,
  parent: null as { name: string; slug: string; isVisible: boolean; isArchived: boolean } | null,
};

describe("reglas de marca", () => {
  it("solo es pública visible y sin archivar", () => {
    expect(isBrandPublic({ isVisible: true, isArchived: false })).toBe(true);
    expect(isBrandPublic({ isVisible: false, isArchived: false })).toBe(false);
    expect(isBrandPublic({ isVisible: true, isArchived: true })).toBe(false);
  });

  it("el logo sale con archivo y sin permiso pendiente o negado", () => {
    expect(canShowBrandLogo({ logoUrl: "x", logoPermission: "ALLOWED" })).toBe(true);
    expect(canShowBrandLogo({ logoUrl: "x", logoPermission: "UNKNOWN" })).toBe(true);
    expect(canShowBrandLogo({ logoUrl: "x", logoPermission: "PENDING" })).toBe(false);
    expect(canShowBrandLogo({ logoUrl: "x", logoPermission: "DENIED" })).toBe(false);
    expect(canShowBrandLogo({ logoUrl: null, logoPermission: "ALLOWED" })).toBe(false);
  });

  it("el nombre para los datos sale aunque esté oculta, nunca archivada", () => {
    expect(brandDataName({ name: "Oculta", isArchived: false })).toBe("Oculta");
    expect(brandDataName({ name: "Vieja", isArchived: true })).toBeNull();
    expect(brandDataName(null)).toBeNull();
  });

  it("la forma pública marca isPublic y quita las archivadas", () => {
    expect(toPublicBrand(brand)).toMatchObject({ name: "Marca A", isPublic: true });
    expect(toPublicBrand({ ...brand, isVisible: false })).toMatchObject({ isPublic: false });
    expect(toPublicBrand({ ...brand, isArchived: true })).toBeNull();
    expect(Object.keys(toPublicBrand(brand)!).sort()).toEqual(
      ["color", "isPublic", "logoHasBackground", "logoPermission", "logoUrl", "name", "parent", "slug"],
    );
  });

  it("limpia los alias: sin vacíos, repetidos ni el propio nombre", () => {
    expect(normalizeBrandAliases(["  FASHION ", "fashion", "", "Klipp", "Fash-ion"], "Klipp")).toEqual([
      "FASHION",
      "Fash-ion",
    ]);
    expect(readStoredAliases("no es lista")).toEqual([]);
  });

  it("revisa el contraste del color con el texto oscuro", () => {
    expect(checkBrandColor("#FDE2EC").ok).toBe(true);
    expect(checkBrandColor("#241B41").ok).toBe(false);
  });
});

describe("líneas de marca", () => {
  const parent = { id: "primavera", storeId: "s1", parentBrandId: null, isArchived: false };

  it("nombre de primer nivel: la madre si la marca es una línea; el que se muestra, la línea", () => {
    const flower = { name: "Flower Power", isArchived: false, parent: { name: "Primavera", isArchived: false } };
    expect(topLevelBrandName(flower)).toBe("Primavera");
    expect(brandDataName(flower)).toBe("Flower Power");
    expect(topLevelBrandName({ name: "Kiut", isArchived: false, parent: null })).toBe("Kiut");
    expect(topLevelBrandName({ ...flower, isArchived: true })).toBeNull();
    expect(topLevelBrandName({ ...flower, parent: { name: "Primavera", isArchived: true } })).toBe("Flower Power");
  });

  it("valida «Es una línea de»: un nivel, misma tienda, madre sin archivar, nunca ella misma", () => {
    expect(brandParentError({ brandId: "flower", storeId: "s1", parent, hasLines: false })).toBeNull();
    expect(brandParentError({ brandId: null, storeId: "s1", parent, hasLines: false })).toBeNull();
    expect(brandParentError({ brandId: "primavera", storeId: "s1", parent, hasLines: false })).toMatch(/sí misma/);
    expect(brandParentError({ brandId: "flower", storeId: "s2", parent, hasLines: false })).toMatch(/no existe/);
    expect(brandParentError({ brandId: "flower", storeId: "s1", parent: null, hasLines: false })).toMatch(/no existe/);
    expect(brandParentError({ brandId: "flower", storeId: "s1", parent: { ...parent, isArchived: true }, hasLines: false })).toMatch(/archivada/);
    expect(brandParentError({ brandId: "mini", storeId: "s1", parent: { ...parent, parentBrandId: "otra" }, hasLines: false })).toMatch(/ya es una línea/);
    expect(brandParentError({ brandId: "scribe", storeId: "s1", parent, hasLines: true })).toMatch(/tiene líneas/);
  });

  it("la forma pública lleva la madre solo si no está archivada", () => {
    const line = { ...brand, parent: { name: "Primavera", slug: "primavera", isVisible: false, isArchived: false } };
    expect(toPublicBrand(line)?.parent).toEqual({ name: "Primavera", slug: "primavera", isPublic: false });
    expect(toPublicBrand({ ...line, parent: { ...line.parent, isArchived: true } })?.parent).toBeNull();
  });
});

describe("orden de líneas", () => {
  it("pone cada línea justo después de su madre sin mover lo demás", () => {
    const rows = [
      { id: "flower", parentBrandId: "primavera" },
      { id: "kiut", parentBrandId: null },
      { id: "primavera", parentBrandId: null },
      { id: "huerfana", parentBrandId: "no-esta" },
    ];
    expect(placeLinesAfterParents(rows).map((row) => row.id)).toEqual(["kiut", "primavera", "flower", "huerfana"]);
  });
});
