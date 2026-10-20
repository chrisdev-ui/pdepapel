import { describe, expect, it } from "vitest";

import {
  REDACTED_ORDER_PATH,
  REDACTED_ORDER_TITLE,
  isOrderReceiptPath,
  redactAnalyticsPath,
  redactAnalyticsTitle,
  redactAnalyticsUrl,
} from "@/lib/analytics-redaction";

const ID = "3f2c1a9e-1111-4222-8333-444455556666";
const ORIGIN = "https://papeleriapdepapel.com";

describe("analítica sin el id del recibo", () => {
  it.each([
    [`/pedido/${ID}`, true],
    [`/pedido/${ID}/`, true],
    [`/order/${ID}`, true],
    ["/pedido", false],
    ["/pedido/", false],
    [`/pedido/${ID}/otra`, false],
    ["/mis-pedidos", false],
    ["/producto/agenda", false],
  ])("%s es recibo: %s", (path, expected) => {
    expect(isOrderReceiptPath(path)).toBe(expected);
    expect(redactAnalyticsPath(path)).toBe(expected ? REDACTED_ORDER_PATH : path);
  });

  it.each([
    [`${ORIGIN}/pedido/${ID}`, `${ORIGIN}/pedido/[id]`],
    [`${ORIGIN}/pedido/${ID}/`, `${ORIGIN}/pedido/[id]`],
    [`${ORIGIN}/pedido/${ID}?id=11111-1111111111-11111&env=test`, `${ORIGIN}/pedido/[id]`],
    [`${ORIGIN}/pedido/${ID}?bold-order-id=ORD-123&bold-tx-status=approved`, `${ORIGIN}/pedido/[id]`],
    [`${ORIGIN}/pedido/${ID}?autoPay=true`, `${ORIGIN}/pedido/[id]`],
    [`${ORIGIN}/pedido/${ID}?utm_source=whatsapp&id=TX-1&utm_campaign=pedido`, `${ORIGIN}/pedido/[id]?utm_source=whatsapp&utm_campaign=pedido`],
    [`${ORIGIN}/pedido/${ID}?UTM_Medium=chat#guardar-pedido`, `${ORIGIN}/pedido/[id]?UTM_Medium=chat`],
    [`/pedido/${ID}?utm_source=email`, `${ORIGIN}/pedido/[id]?utm_source=email`],
  ])("%s → %s", (input, expected) => {
    expect(redactAnalyticsUrl(input)).toBe(expected);
  });

  it("el resto de la tienda no cambia, ni siquiera sus parámetros", () => {
    for (const url of [`${ORIGIN}/tienda?q=agenda&utm_source=ig`, `${ORIGIN}/producto/agenda`, `${ORIGIN}/`, "https://bold.co/pago?x=1"]) {
      expect(redactAnalyticsUrl(url)).toBe(url);
    }
    expect(redactAnalyticsUrl("no es una url::")).toBe("no es una url::");
  });

  it("el título del recibo nunca lleva el número de pedido", () => {
    expect(redactAnalyticsTitle(`/pedido/${ID}`, "Pedido #ORD-123 | Papelería P de Papel")).toBe(REDACTED_ORDER_TITLE);
    expect(REDACTED_ORDER_TITLE).not.toMatch(/ORD|#/);
    expect(redactAnalyticsTitle("/tienda", "Tienda | Papelería P de Papel")).toBe("Tienda | Papelería P de Papel");
  });
});
