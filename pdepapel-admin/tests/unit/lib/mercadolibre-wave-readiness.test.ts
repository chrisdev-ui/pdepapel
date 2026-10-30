import { describe, expect, it } from "vitest";

import { waveItemReadiness, type WaveItemFacts } from "@/lib/mercadolibre/wave-readiness";

const ready: WaveItemFacts = { categoryStatus: "validada", feeSource: "real", photoStatus: "apta", contactSheetApproved: true, presaleBlocked: false };

/** Una tanda solo publica lo que tiene categoría validada (o confirmada por Christian), comisión real, foto apta, hoja aprobada y no está en preventa. */
describe("listo para una tanda de Mercado Libre", () => {
  it("con todo en regla se publica; una categoría corregida por el predictor espera el visto bueno", () => {
    expect(waveItemReadiness(ready)).toEqual({ publishable: true, reasons: [] });
    expect(waveItemReadiness({ ...ready, categoryStatus: "corregida" })).toEqual({
      publishable: false,
      reasons: ["La categoría la propuso el predictor de Mercado Libre: falta tu visto bueno."],
    });
  });

  it("sin categoría validada no se publica", () => {
    expect(waveItemReadiness({ ...ready, categoryStatus: "por confirmar" })).toMatchObject({ publishable: false, reasons: ["Falta validar la categoría de Mercado Libre."] });
    expect(waveItemReadiness({ ...ready, categoryStatus: null }).publishable).toBe(false);
  });

  it("una comisión estimada o pendiente no basta", () => {
    expect(waveItemReadiness({ ...ready, feeSource: "estimado" }).publishable).toBe(false);
    expect(waveItemReadiness({ ...ready, feeSource: "pendiente" }).publishable).toBe(false);
  });

  it("la foto: nueva o por revisar frena; la hoja de contacto sin aprobar también", () => {
    expect(waveItemReadiness({ ...ready, photoStatus: "necesita foto nueva" }).reasons).toEqual(["Necesita una foto nueva."]);
    expect(waveItemReadiness({ ...ready, photoStatus: "revisar" }).publishable).toBe(false);
    expect(waveItemReadiness({ ...ready, contactSheetApproved: false }).publishable).toBe(false);
  });

  it("una preventa nunca entra, aunque todo lo demás esté listo", () => {
    expect(waveItemReadiness({ ...ready, presaleBlocked: true })).toMatchObject({ publishable: false });
  });
});
