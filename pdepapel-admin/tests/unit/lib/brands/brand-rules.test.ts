import { describe, expect, it } from "vitest";

import {
  brandDataName,
  canShowBrandLogo,
  checkBrandColor,
  isBrandPublic,
  normalizeBrandAliases,
  readStoredAliases,
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
      ["color", "isPublic", "logoHasBackground", "logoPermission", "logoUrl", "name", "slug"],
    );
  });

  it("limpia los alias: sin vacíos, repetidos ni el propio nombre", () => {
    expect(normalizeBrandAliases(["  INCOLORS ", "incolors", "", "Scribe", "In-Colors"], "Scribe")).toEqual([
      "INCOLORS",
      "In-Colors",
    ]);
    expect(readStoredAliases("no es lista")).toEqual([]);
  });

  it("revisa el contraste del color con el texto oscuro", () => {
    expect(checkBrandColor("#FDE2EC").ok).toBe(true);
    expect(checkBrandColor("#241B41").ok).toBe(false);
  });
});
