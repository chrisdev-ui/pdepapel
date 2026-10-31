import { describe, expect, it } from "vitest";

import { waveItemReadiness, type WaveItemFacts } from "@/lib/mercadolibre/wave-readiness";

const ready: WaveItemFacts = {
  categoryStatus: "validada",
  categoryMatchesPredictorTop: false,
  feeSource: "real",
  photoStatus: "apta",
  contactSheetApproved: true,
  presaleBlocked: false,
  licensed: null,
};

/** Una tanda solo publica lo que tiene categoría validada (o la primera del predictor), comisión real, foto apta, hoja aprobada, sin preventa ni licencia. */
describe("listo para una tanda de Mercado Libre", () => {
  it("con todo en regla se publica; una categoría corregida solo pasa si es la primera del predictor", () => {
    expect(waveItemReadiness(ready)).toEqual({ publishable: true, reasons: [] });
    expect(waveItemReadiness({ ...ready, categoryStatus: "corregida", categoryMatchesPredictorTop: true })).toEqual({
      publishable: true,
      reasons: [],
    });
    expect(waveItemReadiness({ ...ready, categoryStatus: "corregida" })).toEqual({
      publishable: false,
      reasons: ["La categoría no es la primera del predictor de Mercado Libre: queda por confirmar."],
    });
  });

  it("coincidir con el predictor no valida una categoría por confirmar", () => {
    expect(waveItemReadiness({ ...ready, categoryStatus: "por confirmar", categoryMatchesPredictorTop: true }).reasons).toEqual([
      "Falta validar la categoría de Mercado Libre.",
    ]);
  });

  it("un personaje con licencia nunca entra, aunque todo lo demás esté listo", () => {
    expect(waveItemReadiness({ ...ready, licensed: { label: "Hello Kitty" } })).toEqual({
      publishable: false,
      reasons: ["Personaje con licencia (Hello Kitty): excluido de Mercado Libre."],
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
