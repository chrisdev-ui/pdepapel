import { describe, expect, it } from "vitest";

import {
  ALWAYS_OPEN_LABEL,
  formatOpeningHours,
  storeSettingsInputSchema,
} from "@/lib/store-settings";

const jornada = { abre: "08:00", cierra: "20:00" };
const todaLaSemana = {
  lun: jornada,
  mar: jornada,
  mie: jornada,
  jue: jornada,
  vie: jornada,
  sab: jornada,
  dom: jornada,
};

describe("horario legible", () => {
  it("resume la semana completa con la misma franja", () => {
    expect(formatOpeningHours(todaLaSemana)).toBe("08:00 - 20:00, Lun - Dom");
  });

  it("lista solo los días abiertos", () => {
    expect(formatOpeningHours({ lun: jornada, mar: jornada })).toBe(
      "08:00 - 20:00, Lun, Mar",
    );
  });

  it("detalla cuando los días no coinciden", () => {
    const mezcla = { lun: jornada, sab: { abre: "09:00", cierra: "13:00" } };
    expect(formatOpeningHours(mezcla)).toBe(
      "Lun 08:00-20:00 · Sáb 09:00-13:00",
    );
  });

  it("«a toda hora» manda sobre el detalle por día", () => {
    expect(formatOpeningHours(todaLaSemana, true)).toBe(ALWAYS_OPEN_LABEL);
    expect(formatOpeningHours(null, true)).toBe(ALWAYS_OPEN_LABEL);
  });

  it("sin horario configurado no inventa uno", () => {
    expect(formatOpeningHours(null)).toBeNull();
    expect(formatOpeningHours({})).toBeNull();
  });
});

describe("validación de los datos del negocio", () => {
  it("acepta un horario bien formado", () => {
    expect(
      storeSettingsInputSchema.safeParse({ openingHours: { lun: jornada } })
        .success,
    ).toBe(true);
  });

  it("rechaza una hora que no es una hora", () => {
    expect(
      storeSettingsInputSchema.safeParse({
        openingHours: { lun: { abre: "8am", cierra: "20:00" } },
      }).success,
    ).toBe(false);
  });

  it("rechaza cerrar antes de abrir", () => {
    expect(
      storeSettingsInputSchema.safeParse({
        openingHours: { lun: { abre: "20:00", cierra: "08:00" } },
      }).success,
    ).toBe(false);
  });

  it("un día en null es un día cerrado, no un error", () => {
    expect(
      storeSettingsInputSchema.safeParse({ openingHours: { dom: null } })
        .success,
    ).toBe(true);
  });

  it("con mínimo fijo exige el monto", () => {
    expect(
      storeSettingsInputSchema.safeParse({ minOrderRule: "FIXED" }).success,
    ).toBe(false);
    expect(
      storeSettingsInputSchema.safeParse({
        minOrderRule: "FIXED",
        minOrderAmount: 50000,
      }).success,
    ).toBe(true);
  });

  it("la regla de la casa no necesita monto", () => {
    expect(
      storeSettingsInputSchema.safeParse({ minOrderRule: "MATCH_SHIPPING" })
        .success,
    ).toBe(true);
  });

  it("con tienda física exige dirección", () => {
    expect(
      storeSettingsInputSchema.safeParse({ hasPhysicalStore: true }).success,
    ).toBe(false);
    expect(
      storeSettingsInputSchema.safeParse({
        hasPhysicalStore: true,
        physicalAddress: "Calle 10 #40-20",
      }).success,
    ).toBe(true);
  });
});
