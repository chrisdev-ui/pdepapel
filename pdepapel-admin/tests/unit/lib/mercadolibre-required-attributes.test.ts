import { describe, expect, it } from "vitest";

import type { MercadoLibreCategoryAttribute } from "@/lib/mercadolibre/categories";
import { checkMercadoLibreRequiredAttributes } from "@/lib/mercadolibre/listings";

const attr = (id: string, extra: Partial<MercadoLibreCategoryAttribute> = {}): MercadoLibreCategoryAttribute => ({
  id,
  name: id,
  required: false,
  valueType: "string",
  values: [],
  ...extra,
});

/** Datos reales de MCO430209 (guillotinas) y MCO172631 (marcadores), 2026-10-31. */
const cutter = [
  attr("BRAND", { required: true, catalogRequired: true }),
  attr("MODEL", { required: true, catalogRequired: true }),
  attr("PAPER_CUTTER_TYPE", {
    required: true,
    valueType: "list",
    values: [
      { id: "18536244", name: "Cizalla" },
      { id: "18536243", name: "Guillotina" },
      { id: "18536245", name: "Trimmer" },
    ],
  }),
  attr("GTIN", { conditionalRequired: true }),
  attr("EMPTY_GTIN_REASON", { conditionalRequired: true, valueType: "list", values: [{ id: "17055160", name: "El producto no tiene código registrado" }] }),
  attr("LINE", { catalogRequired: true }),
];
const markers = [
  attr("BRAND", { required: true }),
  attr("MODEL", { required: true }),
  attr("UNITS_PER_PACK", { conditionalRequired: true, valueType: "number" }),
  attr("SALE_FORMAT", { valueType: "list", values: [{ id: "1359391", name: "Unidad" }, { id: "1359392", name: "Pack" }] }),
  attr("GTIN", { conditionalRequired: true }),
];
const noBarcode = { gtin: null, brand: null, hasNoProductIdentifier: true };

describe("ficha técnica frente a la categoría (la misma regla del trabajador y del ensayo)", () => {
  it("lo que falló en la tanda ola-1: MODEL y el tipo de guillotina", () => {
    expect(checkMercadoLibreRequiredAttributes(cutter, [{ id: "BRAND", value_name: "Genérica" }], noBarcode).missing).toEqual([
      "MODEL",
      "PAPER_CUTTER_TYPE",
      "GTIN o EMPTY_GTIN_REASON",
    ]);
  });

  it("GTIN o su motivo vacío: basta uno de los dos", () => {
    const base = [{ id: "BRAND", value_name: "Genérica" }, { id: "MODEL", value_name: "Cortador" }, { id: "PAPER_CUTTER_TYPE", value_id: "18536243" }];
    expect(checkMercadoLibreRequiredAttributes(cutter, [...base, { id: "EMPTY_GTIN_REASON", value_id: "17055160" }], noBarcode).missing).toEqual([]);
    expect(checkMercadoLibreRequiredAttributes(cutter, [...base, { id: "GTIN", value_name: "7701234567890" }], noBarcode).missing).toEqual([]);
  });

  it("un valor fuera de una lista cerrada no pasa; por id o por nombre sí", () => {
    const base = [{ id: "BRAND", value_name: "Genérica" }, { id: "MODEL", value_name: "x" }, { id: "EMPTY_GTIN_REASON", value_id: "17055160" }];
    expect(checkMercadoLibreRequiredAttributes(cutter, [...base, { id: "PAPER_CUTTER_TYPE", value_name: "Circular" }], noBarcode).invalid[0]).toMatch(/^PAPER_CUTTER_TYPE \(Circular; vale: Cizalla, Guillotina, Trimmer\)/);
    expect(checkMercadoLibreRequiredAttributes(cutter, [...base, { id: "PAPER_CUTTER_TYPE", value_name: "guillotina" }], noBarcode).invalid).toEqual([]);
  });

  it("los de catálogo que faltan son avisos, no bloquean", () => {
    const full = [
      { id: "BRAND", value_name: "Genérica" },
      { id: "MODEL", value_name: "x" },
      { id: "PAPER_CUTTER_TYPE", value_id: "18536243" },
      { id: "EMPTY_GTIN_REASON", value_id: "17055160" },
    ];
    expect(checkMercadoLibreRequiredAttributes(cutter, full, noBarcode)).toEqual({ missing: [], invalid: [], warnings: ["LINE"] });
  });

  it("unidades por paquete solo cuando el formato de venta es «Pack»", () => {
    const base = [{ id: "BRAND", value_name: "Kores" }, { id: "MODEL", value_name: "K-Liner" }, { id: "EMPTY_GTIN_REASON", value_id: "17055160" }];
    expect(checkMercadoLibreRequiredAttributes(markers, base, noBarcode).missing).toEqual([]);
    expect(checkMercadoLibreRequiredAttributes(markers, [...base, { id: "SALE_FORMAT", value_id: "1359392" }], noBarcode).missing).toEqual(["UNITS_PER_PACK"]);
    expect(checkMercadoLibreRequiredAttributes(markers, [...base, { id: "SALE_FORMAT", value_id: "1359392" }, { id: "UNITS_PER_PACK", value_name: "24" }], noBarcode).missing).toEqual([]);
  });

  it("GTIN obligatorio (no condicional) sigue exento para un producto sin código legítimo", () => {
    const strict = [attr("GTIN", { required: true })];
    expect(checkMercadoLibreRequiredAttributes(strict, [], noBarcode).missing).toEqual([]);
  });
});
