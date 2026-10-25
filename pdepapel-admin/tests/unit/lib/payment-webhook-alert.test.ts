import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  recordFailedNotification: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findFirst: mocks.findFirst, findUnique: mocks.findUnique },
    paymentWebhookEvent: { count: mocks.count, update: mocks.update },
  },
}));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: mocks.recordFailedNotification }));

import { alertPaymentWebhook, gatewayReferenceOf, sendPaymentAlert } from "@/lib/payment-webhook-alert";
import {
  BOLD_INVALID_SIGNATURE_ERROR,
  classifyPaymentWebhookAlert,
  WOMPI_INVALID_CHECKSUM_ERROR,
} from "@/lib/payment-webhook-events";

const ok = { data: { id: "email" }, error: null };
const freshRedis = () => {
  const keys = new Set<string>();
  return {
    keys,
    set: vi.fn(async (key: string) => {
      if (keys.has(key)) return null;
      keys.add(key);
      return "OK";
    }),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(3);
  mocks.update.mockResolvedValue({});
});

describe("classifyPaymentWebhookAlert", () => {
  it.each([
    ["BOLD", 500, "Error interno procesando webhook de Bold: boom", "server-error"],
    ["WOMPI", 500, "Error finding order for wompi webhook: Error: db down", "server-error"],
    ["BOLD", 404, "Orden no encontrada: ORD-1", "authenticated-rejection"],
    ["BOLD", 400, "La orden ORD-1 no está configurada para pago en línea", "authenticated-rejection"],
    ["BOLD", 400, "El monto de Bold no coincide con la orden ORD-1", "authenticated-rejection"],
    ["WOMPI", 400, "Order not found: x", "authenticated-rejection"],
    ["WOMPI", 400, "Wompi payment is not valid. TRANSACTION ID: (t)", "authenticated-rejection"],
    ["BOLD", 400, BOLD_INVALID_SIGNATURE_ERROR, "signature"],
    ["WOMPI", 400, WOMPI_INVALID_CHECKSUM_ERROR, "signature"],
    ["BOLD", 400, "Payload no recibido", null],
    ["WOMPI", 400, "El cuerpo del webhook no es JSON válido", null],
    ["WOMPI", 400, "Error on body request", null],
    ["WOMPI", 400, "Event not found: foo", null],
    ["BOLD", 200, null, null],
  ] as const)("%s %i «%s» → %s", (provider, status, error, kind) => {
    expect(classifyPaymentWebhookAlert(provider, status, error)).toBe(kind);
  });

  it("el cuerpo ilegible de Bold llega después de validar la firma: es auténtico", () => {
    expect(classifyPaymentWebhookAlert("BOLD", 400, "El cuerpo del webhook no es JSON válido")).toBe("authenticated-rejection");
  });
});

describe("gatewayReferenceOf", () => {
  it("solo reconoce cuerpos con la forma de la pasarela", () => {
    expect(gatewayReferenceOf("BOLD", JSON.stringify({ type: "SALE_APPROVED", data: { metadata: { reference: "ORD-1" } } }))).toBe("ORD-1");
    expect(gatewayReferenceOf("BOLD", JSON.stringify({ type: "HACK", data: { metadata: { reference: "ORD-1" } } }))).toBeNull();
    expect(gatewayReferenceOf("BOLD", "<?php")).toBeNull();
    expect(gatewayReferenceOf("WOMPI", JSON.stringify({ event: "transaction.updated", data: { transaction: { reference: "o-1" } } }))).toBe("o-1");
    expect(gatewayReferenceOf("WOMPI", JSON.stringify({ event: "transaction.updated", data: {} }))).toBeNull();
  });
});

describe("sendPaymentAlert", () => {
  const alert = { provider: "BOLD" as const, kind: "server-error" as const, storeId: "s1", orderId: "o1", orderNumber: "ORD-1", statusCode: 500, error: "boom" };

  it("fuera de producción no hace nada", async () => {
    const send = vi.fn();
    await expect(sendPaymentAlert(alert, { send, redis: freshRedis() })).resolves.toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("sale una vez por hora por proveedor y tipo, con plantilla y texto", async () => {
    const redis = freshRedis();
    const send = vi.fn().mockResolvedValue(ok);
    const deps = { enabled: true, redis, send, recipients: async () => ["a@x.test"] };
    await expect(sendPaymentAlert(alert, deps)).resolves.toBe("sent");
    await expect(sendPaymentAlert(alert, deps)).resolves.toBe("cooldown");
    await expect(sendPaymentAlert({ ...alert, kind: "signature" }, deps)).resolves.toBe("sent");
    expect(redis.keys).toEqual(new Set(["monitor:payment-webhook:BOLD:server-error", "monitor:payment-webhook:BOLD:signature"]));
    const email = send.mock.calls[0][0];
    expect(email.to).toEqual(["a@x.test"]);
    expect(email.react).toBeTruthy();
    expect(email.text).toContain("Pedido: #ORD-1");
    expect(email.text).toContain("en la última hora: 3");
    expect(email.text).toContain("Este aviso sale como mucho una vez por hora.");
  });

  it("si Redis falla, manda igual", async () => {
    const send = vi.fn().mockResolvedValue(ok);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const redis = { set: vi.fn().mockRejectedValue(new Error("redis down")) };
    await expect(sendPaymentAlert(alert, { enabled: true, redis, send, recipients: async () => ["a@x.test"] })).resolves.toBe("sent");
  });

  it("sin destinatarios queda como fallido", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(sendPaymentAlert(alert, { enabled: true, redis: freshRedis(), send: vi.fn(), recipients: async () => [] })).resolves.toBe("failed");
  });

  it("la llave rechazada nombra la variable, nunca su valor", async () => {
    const send = vi.fn().mockResolvedValue(ok);
    await sendPaymentAlert({ provider: "WOMPI", kind: "key-rejected", statusCode: 401 }, { enabled: true, redis: freshRedis(), send, recipients: async () => ["a@x.test"] });
    expect(send.mock.calls[0][0].subject).toBe("⚠️ Llave de Wompi rechazada");
    expect(send.mock.calls[0][0].text).toContain("WOMPI_API_SECRET");
  });
});

describe("alertPaymentWebhook", () => {
  const deps = () => ({ enabled: true, redis: freshRedis(), send: vi.fn().mockResolvedValue(ok), recipients: async () => ["a@x.test"] });
  const signed = JSON.stringify({ type: "SALE_APPROVED", data: { metadata: { reference: "ORD-1" } } });

  it("apagado no consulta la base", async () => {
    await expect(alertPaymentWebhook({ provider: "BOLD", eventId: "e1", statusCode: 400, error: BOLD_INVALID_SIGNATURE_ERROR, rawBody: signed, context: {} })).resolves.toBe("skipped");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("firma inválida sin pedido: ni correo ni anotación", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const d = deps();
    await expect(alertPaymentWebhook({ provider: "BOLD", eventId: "e1", statusCode: 400, error: BOLD_INVALID_SIGNATURE_ERROR, rawBody: signed, context: {} }, d)).resolves.toBe("skipped");
    expect(d.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("firma inválida con pedido: anota la fila y avisa", async () => {
    mocks.findFirst.mockResolvedValue({ id: "o1", storeId: "s1", orderNumber: "ORD-1" });
    const d = deps();
    await expect(alertPaymentWebhook({ provider: "BOLD", eventId: "e1", statusCode: 400, error: BOLD_INVALID_SIGNATURE_ERROR, rawBody: signed, context: {} }, d)).resolves.toBe("sent");
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { OR: [{ id: "ORD-1" }, { orderNumber: "ORD-1" }] }, select: { id: true, storeId: true, orderNumber: true } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { orderId: "o1", storeId: "s1", orderReference: "ORD-1" } });
  });

  it("rechazo auténtico con pedido resuelto avisa con su número", async () => {
    mocks.findUnique.mockResolvedValue({ orderNumber: "ORD-9" });
    const d = deps();
    await alertPaymentWebhook({ provider: "WOMPI", eventId: "e1", statusCode: 400, error: "Wompi payment is not valid. TRANSACTION ID: (t)", rawBody: "{}", context: { orderId: "o9", storeId: "s1" } }, d);
    expect(d.send.mock.calls[0][0].text).toContain("Pedido: #ORD-9");
  });

  it("un sondeo previo a la firma no avisa", async () => {
    const d = deps();
    await expect(alertPaymentWebhook({ provider: "WOMPI", eventId: "e1", statusCode: 400, error: "Event not found: x", rawBody: "{}", context: {} }, d)).resolves.toBe("skipped");
    expect(d.send).not.toHaveBeenCalled();
  });
});
