import { describe, expect, it } from "vitest";

import {
  formatTaxPeriodLabel,
  getDefaultTaxReportPeriod,
  getTaxReportPeriodPresets,
  isSameTaxReportPeriod,
  matchTaxReportPreset,
} from "@/lib/tax-report-period";

/** Un 21 de septiembre de 2026, que es cuando se encontró el fallo. */
const HOY = new Date(2026, 8, 21);

describe("getDefaultTaxReportPeriod", () => {
  it("abre en el año en curso hasta hoy", () => {
    expect(getDefaultTaxReportPeriod(HOY)).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-09-21",
    });
  });

  it("no envejece: el año siguiente devuelve el año siguiente", () => {
    // El fallo original era justo este: dos fechas fijas de 2025 que en
    // septiembre de 2026 abrían nueve meses tarde.
    expect(getDefaultTaxReportPeriod(new Date(2027, 0, 3))).toEqual({
      startDate: "2027-01-01",
      endDate: "2027-01-03",
    });
  });

  it("rellena mes y día con cero a la izquierda", () => {
    expect(getDefaultTaxReportPeriod(new Date(2026, 2, 5)).endDate).toBe(
      "2026-03-05",
    );
  });
});

describe("getTaxReportPeriodPresets", () => {
  it("ofrece los rangos que de verdad se piden", () => {
    const presets = getTaxReportPeriodPresets(HOY);
    expect(presets.map((preset) => preset.id)).toEqual([
      "este-ano",
      "ano-pasado",
      "primer-semestre",
      "segundo-semestre",
    ]);
    expect(presets[1]).toMatchObject({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
    expect(presets[2]).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    });
  });

  it("«este año» es exactamente el período por defecto", () => {
    const [esteAno] = getTaxReportPeriodPresets(HOY);
    const porDefecto = getDefaultTaxReportPeriod(HOY);
    expect(isSameTaxReportPeriod(esteAno, porDefecto)).toBe(true);
  });
});

describe("matchTaxReportPreset", () => {
  it("reconoce un rango que coincide con un atajo", () => {
    expect(
      matchTaxReportPreset(
        { startDate: "2025-01-01", endDate: "2025-12-31" },
        HOY,
      )?.id,
    ).toBe("ano-pasado");
  });

  it("no inventa coincidencias con un rango a mano", () => {
    expect(
      matchTaxReportPreset(
        { startDate: "2026-02-03", endDate: "2026-04-04" },
        HOY,
      ),
    ).toBeNull();
  });
});

describe("formatTaxPeriodLabel", () => {
  it("omite el año de la primera fecha cuando los dos coinciden", () => {
    expect(
      formatTaxPeriodLabel({ startDate: "2026-01-01", endDate: "2026-09-21" }),
    ).toBe("1 ene – 21 sep 2026");
  });

  it("lo conserva cuando el período cruza de año", () => {
    expect(
      formatTaxPeriodLabel({ startDate: "2025-07-01", endDate: "2026-06-30" }),
    ).toBe("1 jul 2025 – 30 jun 2026");
  });
});
