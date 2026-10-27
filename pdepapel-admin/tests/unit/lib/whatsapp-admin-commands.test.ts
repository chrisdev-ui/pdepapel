import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { formatEstado, HELP_TEXT, parseAdminCommand, paymentLabel, type EstadoOrder } from "@/lib/whatsapp/admin-commands";

describe("parseAdminCommand", () => {
  it("solo lo que empieza con «/» es comando", () => {
    expect(parseAdminCommand("hola")).toBeNull();
    expect(parseAdminCommand(" estado ORD-1")).toBeNull();
    expect(parseAdminCommand("")).toBeNull();
    expect(parseAdminCommand(null)).toBeNull();
  });

  it("reconoce /ayuda sin importar mayúsculas ni espacios", () => {
    expect(parseAdminCommand("  /AYUDA ")).toEqual({ command: "ayuda", known: "ayuda", orderNumber: null });
    expect(parseAdminCommand("/help")).toMatchObject({ known: "ayuda" });
  });

  it("/estado toma el número de pedido, con o sin #, y lo normaliza", () => {
    expect(parseAdminCommand("/estado ORD-1791998787841-915")).toEqual({ command: "estado", known: "estado", orderNumber: "ORD-1791998787841-915" });
    expect(parseAdminCommand("/Estado #ord-1791998787841-915")).toMatchObject({ orderNumber: "ORD-1791998787841-915" });
    expect(parseAdminCommand("/ESTADO   ord-1  algo más")).toMatchObject({ orderNumber: "ORD-1" });
  });

  it("/estado sin número o con algo que no es un número de pedido no guarda argumento", () => {
    expect(parseAdminCommand("/estado")).toMatchObject({ known: "estado", orderNumber: null });
    expect(parseAdminCommand("/estado María Pérez")).toMatchObject({ orderNumber: null });
    expect(parseAdminCommand("/estado <script>")).toMatchObject({ orderNumber: null });
  });

  it("un comando desconocido guarda solo una palabra corta, nunca texto libre", () => {
    expect(parseAdminCommand("/pedido 30000 2 agendas")).toEqual({ command: "pedido", known: null, orderNumber: null });
    expect(parseAdminCommand("/guía 1234")).toMatchObject({ command: "guia", known: null });
    expect(parseAdminCommand("/unapalabrademasiadolarga")).toMatchObject({ command: "?" });
    expect(parseAdminCommand("/")).toMatchObject({ command: "?" });
  });
});

describe("respuestas", () => {
  it("la ayuda lista los comandos con un ejemplo y advierte del chat de clientas", () => {
    expect(HELP_TEXT).toContain("/estado <número de pedido>");
    expect(HELP_TEXT).toContain("/ayuda");
    expect(HELP_TEXT).toContain("nunca en el de una clienta");
  });

  it("el pago en línea nunca nombra la pasarela", () => {
    expect(paymentLabel(PaymentMethod.Bold)).toBe("Pago en línea");
    expect(paymentLabel(PaymentMethod.Wompi)).toBe("Pago en línea");
    expect(paymentLabel(PaymentMethod.COD)).toBe("Contra entrega");
    expect(paymentLabel(null)).toBe("Sin método de pago");
  });

  const order = (shipping: EstadoOrder["shipping"]): EstadoOrder => ({
    id: "o1",
    orderNumber: "ORD-1",
    status: OrderStatus.PAID,
    payment: { method: PaymentMethod.BankTransfer },
    shipping,
  });

  it("/estado: estado, pago, envío con transportadora y guía, y el último movimiento en hora de Bogotá", () => {
    const text = formatEstado(
      order({
        status: ShippingStatus.OutForDelivery,
        carrierName: "ENVIA",
        courier: null,
        trackingCode: "123",
        trackingEvents: [{ description: "En reparto", location: "Medellín", timestamp: new Date("2026-10-27T20:12:00Z") }],
      }),
    );
    const [first, second, third] = text.split("\n");
    expect(first).toBe("Pedido ORD-1: Pagado · Transferencia");
    expect(second).toBe("Envío: En reparto · ENVIA, guía 123");
    // 20:12 UTC son las 3:12 p. m. en Bogotá; Intl separa con espacios finos.
    expect(third).toMatch(/^Último movimiento 27 de oct,\s3:12\sp\.\sm\.: En reparto \(Medellín\)$/);
  });

  it("/estado sin envío o sin guía lo dice", () => {
    expect(formatEstado(order(null))).toContain("Envío: sin envío registrado");
    expect(formatEstado(order({ status: ShippingStatus.Preparing, carrierName: null, courier: null, trackingCode: null, trackingEvents: [] }))).toContain("Preparando envío · sin guía");
  });
});

describe("etiquetas de envío", () => {
  it("son las mismas que las del panel", { timeout: 60_000 }, async () => {
    vi.doMock("@/lib/env.mjs", () => ({ env: {} }));
    const { getReadableStatus } = await import("@/lib/utils");
    for (const status of Object.values(ShippingStatus)) {
      const text = formatEstado({ id: "o", orderNumber: "X", status: OrderStatus.PAID, payment: null, shipping: { status, carrierName: null, courier: null, trackingCode: null, trackingEvents: [] } });
      expect(text).toContain(`Envío: ${getReadableStatus(status)} ·`);
    }
  });
});
