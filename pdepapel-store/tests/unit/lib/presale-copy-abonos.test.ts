import { describe, expect, it } from "vitest";

import { depositProgressText, depositTermsCheckboxText, PRESALE_EXCESS_REFUND, PRESALE_NON_REFUNDABLE, presaleHowItWorks, presaleRefundRule } from "@/lib/presale-copy";

/**
 * Abonos libres en la tienda: la línea de avance del pedido y la frase de «no
 * reembolsable», que vive en un solo lugar (ficha, caja y términos).
 */
describe("textos de la preventa con abonos", () => {
  it("«Llevas $X pagado · faltan $Y + envío»; pagado todo, solo el envío", () => {
    expect(depositProgressText(60000, 100000).replace(/\s/g, " ")).toBe("Llevas $ 60.000 pagado · faltan $ 100.000 + envío");
    expect(depositProgressText(160000, 0).replace(/\s/g, " ")).toBe("Llevas $ 160.000 pagado · solo falta el envío");
  });

  it("la frase de no reembolsable sale de una sola constante en la ficha y en la casilla de la caja", () => {
    // Redacción por defecto pendiente de Paula y la abogada: solo el anticipo se retiene.
    expect(PRESALE_NON_REFUNDABLE).toBe("Solo el anticipo no es reembolsable");
    expect(presaleRefundRule(30000).replace(/\s/g, " ")).toBe(
      `Solo los primeros $ 30.000 por unidad no son reembolsables, salvo el derecho de retracto de ley o si el producto no llega; ${PRESALE_EXCESS_REFUND}`,
    );
    expect(presaleHowItWorks(30000).join(" ")).toContain(presaleRefundRule(30000));
    expect(depositTermsCheckboxText(30000)).toContain(`${PRESALE_NON_REFUNDABLE}, salvo`);
    expect(depositTermsCheckboxText(30000)).toContain(PRESALE_EXCESS_REFUND);
  });
});
