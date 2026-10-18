import { describe, expect, it } from "vitest";

import { mercadoLibreBrandName, mercadoLibreLineName } from "@/lib/mercadolibre/brand";
import { prefillListingAttributes } from "@/lib/mercadolibre/listing-wizard";

describe("BRAND de Mercado Libre", () => {
  it("usa la marca enlazada (también oculta) y la del grupo", () => {
    expect(mercadoLibreBrandName({ brand: "Texto viejo", brandRef: { name: "Enlazada", isArchived: false } })).toBe("Enlazada");
    expect(mercadoLibreBrandName({ brandRef: null, productGroup: { brandRef: { name: "Del grupo", isArchived: false } } })).toBe("Del grupo");
  });

  it("una marca archivada no viaja, tampoco su texto viejo", () => {
    expect(mercadoLibreBrandName({ brand: "Texto viejo", brandRef: { name: "Archivada", isArchived: true } })).toBeNull();
  });

  it("sin marca enlazada usa el texto anterior mientras dure la migración", () => {
    expect(mercadoLibreBrandName({ brand: "  Texto viejo ", brandRef: null })).toBe("Texto viejo");
    expect(mercadoLibreBrandName({ brand: null, brandRef: null, productGroup: { brand: "Del grupo viejo" } })).toBe("Del grupo viejo");
    expect(mercadoLibreBrandName({ brand: "", brandRef: null })).toBeNull();
  });
});

describe("líneas en Mercado Libre", () => {
  const flower = { name: "Flower Power", isArchived: false, parent: { name: "Primavera", isArchived: false } };

  it("BRAND lleva la marca madre y LINE la línea", () => {
    expect(mercadoLibreBrandName({ brandRef: flower })).toBe("Primavera");
    expect(mercadoLibreLineName({ brandRef: flower })).toBe("Flower Power");
    expect(mercadoLibreLineName({ brandRef: null, productGroup: { brandRef: flower } })).toBe("Flower Power");
  });

  it("una marca sin madre no manda LINE", () => {
    expect(mercadoLibreBrandName({ brandRef: { name: "Kiut", isArchived: false, parent: null } })).toBe("Kiut");
    expect(mercadoLibreLineName({ brandRef: { name: "Kiut", isArchived: false, parent: null } })).toBeNull();
  });
});

describe("LINE en la ficha técnica", () => {
  const attributes = [
    { id: "BRAND", name: "Marca", values: [] },
    { id: "LINE", name: "Línea", values: [] },
  ];

  it("se rellena solo si la categoría tiene LINE y la marca es una línea", () => {
    expect(prefillListingAttributes("", attributes as never, { brand: "Primavera", brandLine: "Flower Power" })).toBe(
      "BRAND=Primavera\nLINE=Flower Power",
    );
    expect(prefillListingAttributes("", [attributes[0]] as never, { brand: "Primavera", brandLine: "Flower Power" })).toBe("BRAND=Primavera");
    expect(prefillListingAttributes("", attributes as never, { brand: "Kiut", brandLine: null })).toBe("BRAND=Kiut");
  });

  it("nunca pisa un LINE ya escrito", () => {
    expect(prefillListingAttributes("LINE=Otra", attributes as never, { brand: "Primavera", brandLine: "Flower Power" })).toBe(
      "LINE=Otra\nBRAND=Primavera",
    );
  });
});
