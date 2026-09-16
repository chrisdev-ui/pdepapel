import { describe, expect, it } from "vitest";

import { canTransition, describeDeletionBlock, describeForbiddenTransition, getAllowedTransitions, getStatusActions, isPaidLike } from "@/lib/order-transitions";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

const standard = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.BankTransfer };
const cod = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.COD };
const quote = { type: OrderType.QUOTATION, paymentMethod: null };

describe("order transitions", () => {
  it("never lets a paid order go back to pending or draft", () => {
    expect(canTransition(OrderStatus.PAID, OrderStatus.PENDING, standard)).toBe(false);
    expect(canTransition(OrderStatus.PAID, OrderStatus.DRAFT, standard)).toBe(false);
    expect(canTransition(OrderStatus.SENT, OrderStatus.PENDING, standard)).toBe(false);
    expect(canTransition(OrderStatus.PAID, OrderStatus.SENT, standard)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.CANCELLED, standard)).toBe(true);
    expect(describeForbiddenTransition(OrderStatus.PAID, OrderStatus.PENDING)).toContain("cancela el pedido");
    expect(isPaidLike(OrderStatus.SENT)).toBe(true);
  });

  it("lets cash on delivery ship before payment and collect after delivery", () => {
    expect(getAllowedTransitions(OrderStatus.PENDING, cod)).toContain(OrderStatus.SENT);
    expect(getAllowedTransitions(OrderStatus.PENDING, standard)).not.toContain(OrderStatus.SENT);
    expect(getAllowedTransitions(OrderStatus.SENT, cod)).toContain(OrderStatus.PAID);
    expect(getAllowedTransitions(OrderStatus.SENT, standard)).not.toContain(OrderStatus.PAID);
  });

  it("keeps the quote flow separate from the order flow", () => {
    expect(getAllowedTransitions(OrderStatus.DRAFT, quote)).toContain(OrderStatus.QUOTATION);
    expect(getAllowedTransitions(OrderStatus.DRAFT, standard)).not.toContain(OrderStatus.QUOTATION);
    expect(getAllowedTransitions(OrderStatus.ACCEPTED, quote)).toEqual([OrderStatus.PAID, OrderStatus.PENDING, OrderStatus.REJECTED, OrderStatus.CANCELLED]);
    expect(canTransition(OrderStatus.REJECTED, OrderStatus.QUOTATION, quote)).toBe(true);
    expect(canTransition(OrderStatus.PENDING, OrderStatus.PENDING, standard)).toBe(true);
  });

  it("offers explicit actions: paying always confirms, cancelling is destructive", () => {
    const pending = getStatusActions(OrderStatus.PENDING, standard);
    expect(pending).toEqual([
      { to: OrderStatus.PAID, label: "Marcar como pagado", primary: true, confirm: "pay", destructive: false },
      { to: OrderStatus.CANCELLED, label: "Cancelar pedido", primary: false, confirm: "cancel", destructive: true },
    ]);
    const paid = getStatusActions(OrderStatus.PAID, standard);
    expect(paid.map((a) => a.to)).toEqual([OrderStatus.SENT, OrderStatus.CANCELLED]);
    expect(paid[0].confirm).toBe("ship");
    expect(paid[1].label).toBe("Cancelar y devolver el inventario");
    const draftQuote = getStatusActions(OrderStatus.DRAFT, quote);
    expect(draftQuote[0]).toMatchObject({ to: OrderStatus.QUOTATION, label: "Enviar cotización", primary: true });
    expect(getStatusActions(OrderStatus.CANCELLED, standard).map((a) => a.to)).toEqual([OrderStatus.PENDING]);
    const online = getStatusActions(OrderStatus.PENDING, { type: OrderType.STANDARD, paymentMethod: PaymentMethod.Bold });
    expect(online[0]).toMatchObject({ to: OrderStatus.PAID, label: "Registrar pago a mano", primary: false, confirm: "pay" });
  });
});

/**
 * La reordenación del formulario movió las acciones de sitio, no las reglas.
 * Un caso por regla, para poder señalarlas de una en una.
 */
describe("las reglas que la reordenación NO puede cambiar", () => {
  const online = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.Bold };
  const labels = (
    status: OrderStatus,
    ctx: { type: OrderType; paymentMethod: PaymentMethod | null },
  ) => getStatusActions(status, ctx).map((a) => a.label);

  it("Borrador: activar, marcar pagado y cancelar", () => {
    expect(getAllowedTransitions(OrderStatus.DRAFT, standard)).toEqual(
      expect.arrayContaining([OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.CANCELLED]),
    );
    expect(labels(OrderStatus.DRAFT, standard)).toEqual(
      expect.arrayContaining(["Activar pedido", "Marcar como pagado", "Cancelar pedido"]),
    );
  });

  it("Pendiente: marcar pagado y cancelar", () => {
    expect(getAllowedTransitions(OrderStatus.PENDING, standard)).toEqual(
      expect.arrayContaining([OrderStatus.PAID, OrderStatus.CANCELLED]),
    );
  });

  it("Pendiente con pago en línea: marcar a mano es la excepción, no el botón principal", () => {
    const pagar = getStatusActions(OrderStatus.PENDING, online).find(
      (a) => a.to === OrderStatus.PAID,
    );
    expect(pagar?.label).toBe("Registrar pago a mano");
    expect(pagar?.primary).toBe(false);
  });

  it("Pendiente contra entrega: puede ir directo a Enviado", () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.SENT, cod)).toBe(true);
    expect(canTransition(OrderStatus.PENDING, OrderStatus.SENT, standard)).toBe(false);
  });

  it("Pagado: marcar enviado y cancelar devolviendo el inventario", () => {
    expect(getAllowedTransitions(OrderStatus.PAID, standard)).toEqual([
      OrderStatus.SENT,
      OrderStatus.CANCELLED,
    ]);
    const cancelar = getStatusActions(OrderStatus.PAID, standard).find(
      (a) => a.to === OrderStatus.CANCELLED,
    );
    expect(cancelar?.label).toBe("Cancelar y devolver el inventario");
    expect(cancelar?.destructive).toBe(true);
  });

  it("Enviado: se puede cancelar, y contra entrega registra el pago cobrado", () => {
    expect(canTransition(OrderStatus.SENT, OrderStatus.CANCELLED, standard)).toBe(true);
    expect(canTransition(OrderStatus.SENT, OrderStatus.PAID, cod)).toBe(true);
    expect(canTransition(OrderStatus.SENT, OrderStatus.PAID, standard)).toBe(false);
  });

  it("Cancelado: se reactiva como pendiente", () => {
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.PENDING, standard)).toBe(true);
    expect(labels(OrderStatus.CANCELLED, standard)).toContain("Reactivar como pendiente");
  });

  it("Cotización enviada o vista: aceptar, convertir, rechazar, volver a borrador", () => {
    for (const from of [OrderStatus.QUOTATION, OrderStatus.VIEWED]) {
      expect(labels(from, quote)).toEqual(
        expect.arrayContaining([
          "Marcar aceptada",
          "Convertir en pedido",
          "Marcar rechazada",
          "Volver a borrador",
        ]),
      );
    }
  });

  it("Aceptada: registrar pago o convertir en pendiente", () => {
    expect(labels(OrderStatus.ACCEPTED, quote)).toEqual(
      expect.arrayContaining(["Registrar pago", "Convertir en pedido pendiente"]),
    );
  });

  it("Rechazada: reabrir cotización o volver a borrador", () => {
    expect(labels(OrderStatus.REJECTED, quote)).toEqual(
      expect.arrayContaining(["Reabrir cotización", "Volver a borrador"]),
    );
  });

  it("cancelar siempre está, y siempre es destructivo", () => {
    for (const from of [
      OrderStatus.DRAFT, OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SENT,
    ]) {
      const cancelar = getStatusActions(from, standard).find(
        (a) => a.to === OrderStatus.CANCELLED,
      );
      expect(cancelar?.destructive).toBe(true);
    }
  });

  it("la barra de estado reparte: normales arriba, destructivas aparte", () => {
    // Es lo que hacen las dos variantes de StatusActions dentro de la barra.
    const todas = getStatusActions(OrderStatus.PAID, standard);
    const normales = todas.filter((a) => !a.destructive);
    const cuidado = todas.filter((a) => a.destructive);
    expect(normales.map((a) => a.label)).toEqual(["Marcar como enviado"]);
    expect(cuidado.map((a) => a.label)).toEqual(["Cancelar y devolver el inventario"]);
    // Entre las dos no se pierde ninguna.
    expect(normales.length + cuidado.length).toBe(todas.length);
  });
});

describe("borrar un pedido con guía viva", () => {
  it("se bloquea y dice qué hacer antes", () => {
    const motivo = describeDeletionBlock({
      orderNumber: "ORD-1",
      shipping: { envioClickIdOrder: 4703951, trackingCode: "240850888282" },
    });
    expect(motivo).toContain("guía de EnvioClick activa");
    expect(motivo).toContain("240850888282");
    expect(motivo).toContain("Cancela el envío antes de eliminarlo");
  });

  it("sin número de seguimiento, señala la guía por su id", () => {
    expect(
      describeDeletionBlock({
        orderNumber: "ORD-2",
        shipping: { envioClickIdOrder: 4703951, trackingCode: null },
      }),
    ).toContain("4703951");
  });

  it("sin guía se puede borrar", () => {
    expect(describeDeletionBlock({ orderNumber: "ORD-3", shipping: null })).toBeNull();
    expect(
      describeDeletionBlock({
        orderNumber: "ORD-4",
        shipping: { envioClickIdOrder: null },
      }),
    ).toBeNull();
  });
});
