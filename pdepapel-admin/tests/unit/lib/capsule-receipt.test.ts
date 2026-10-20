import { OrderStatus, PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { capsuleThanksParagraph } from "@/lib/capsule-receipt";

describe("el agradecimiento del correo de un pack", () => {
  const pack = { packSize: 10, giftLabel: "1 regalo sorpresa" };

  it("pagado: abrimos tus cápsulas y te enviamos los productos, con el regalo", () => {
    expect(capsuleThanksParagraph(pack, OrderStatus.PAID, PaymentMethod.Bold)).toMatch(/Abriremos tus cápsulas.*Tu pack trae 1 regalo sorpresa/);
  });

  it("por transferencia sin verificar: el cupo guardado 24 horas y cómo subir el comprobante", () => {
    const text = capsuleThanksParagraph(pack, OrderStatus.PENDING, PaymentMethod.BankTransfer);
    expect(text).toContain("te guardamos el cupo de hoy por 24 horas");
    expect(text).toContain("Sube el comprobante de tu transferencia");
  });

  it("en línea sin confirmar y sin cifras de lo que vale", () => {
    const text = capsuleThanksParagraph({ packSize: 5, giftLabel: null }, OrderStatus.PENDING, PaymentMethod.Bold);
    expect(text).toContain("Cuando se confirme el pago");
    expect(text).not.toMatch(/\$|vale|lucky/i);
  });
});
