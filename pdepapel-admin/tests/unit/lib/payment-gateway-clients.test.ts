import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { getBoldPaymentVoucher } from "@/lib/bold";
import { findWompiTransactionsByReference, wompiApiBase } from "@/lib/wompi-api";

const fixture = (name: string) => readFileSync(path.resolve(__dirname, "../../fixtures/gateways", name), "utf8");
const reply = (status: number, name: string | null) => vi.fn(async () => new Response(name ? fixture(name) : "", { status, headers: { "content-type": "application/json" } }));
const wompi = { baseUrl: "https://production.wompi.co/v1", privateKey: "prv_test_x" };

describe("Wompi: transacciones por referencia (llave privada)", () => {
  it("consulta /v1/transactions?reference=<id del pedido> con la llave privada y un tiempo límite", async () => {
    const fetch = reply(200, "wompi-transactions-approved.json");
    const result = await findWompiTransactionsByReference("order-1", wompi, { fetch });
    expect(result).toMatchObject({ kind: "found", items: [{ id: "12345-1700000000-11111", status: "APPROVED", amount_in_cents: 8000000 }] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://production.wompi.co/v1/transactions?reference=order-1");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer prv_test_x");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("acepta la URL base con o sin /v1", () => {
    expect(wompiApiBase("https://production.wompi.co")).toBe("https://production.wompi.co/v1");
    expect(wompiApiBase("https://sandbox.wompi.co/v1/")).toBe("https://sandbox.wompi.co/v1");
  });

  it.each([
    ["wompi-transactions-declined.json", "DECLINED"],
    ["wompi-transactions-voided.json", "VOIDED"],
    ["wompi-transactions-error.json", "ERROR"],
    ["wompi-transactions-pending.json", "PENDING"],
  ])("%s → found con estado %s", async (name, status) => {
    const result = await findWompiTransactionsByReference("order-1", wompi, { fetch: reply(200, name) });
    expect(result).toMatchObject({ kind: "found", items: [{ status }] });
  });

  it("`data` como objeto suelto también vale", async () => {
    expect(await findWompiTransactionsByReference("order-1", wompi, { fetch: reply(200, "wompi-transaction-object.json") })).toMatchObject({ kind: "found" });
  });

  it("lista vacía o de otra referencia → none", async () => {
    expect(await findWompiTransactionsByReference("order-1", wompi, { fetch: reply(200, "wompi-transactions-empty.json") })).toEqual({ kind: "none" });
    expect(await findWompiTransactionsByReference("otro", wompi, { fetch: reply(200, "wompi-transactions-approved.json") })).toEqual({ kind: "none" });
  });

  it("401 INVALID_ACCESS_TOKEN es llave rechazada, no caída", async () => {
    expect(await findWompiTransactionsByReference("order-1", wompi, { fetch: reply(401, "wompi-401-invalid-access-token.json") })).toEqual({ kind: "key-rejected", status: 401 });
  });

  it("5xx, tiempo agotado o red caída → unavailable", async () => {
    expect(await findWompiTransactionsByReference("order-1", wompi, { fetch: reply(503, null) })).toEqual({ kind: "unavailable", status: 503, reason: "HTTP 503" });
    const timeout = vi.fn(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    });
    expect(await findWompiTransactionsByReference("order-1", wompi, { fetch: timeout })).toEqual({ kind: "unavailable", status: null, reason: "tiempo agotado" });
  });
});

describe("Bold: comprobante de venta del Botón de pagos", () => {
  it("consulta payment-voucher/<referencia> con la llave de identidad", async () => {
    const fetch = reply(200, "bold-voucher-approved.json");
    const result = await getBoldPaymentVoucher("ORD-1", "identity-key", { fetch });
    expect(result).toMatchObject({ kind: "found", items: [{ payment_status: "APPROVED", total: 80000, transaction_id: "TX_BOLD_1" }] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://payments.api.bold.co/v2/payment-voucher/ORD-1");
    expect((init.headers as Record<string, string>).authorization).toBe("x-api-key identity-key");
  });

  it.each(["rejected", "failed", "voided", "processing", "pending"])("bold-voucher-%s → found", async (status) => {
    expect(await getBoldPaymentVoucher("ORD-1", "k", { fetch: reply(200, `bold-voucher-${status}.json`) })).toMatchObject({ kind: "found", items: [{ payment_status: status.toUpperCase() }] });
  });

  it("NO_TRANSACTION_FOUND y 404 → none", async () => {
    expect(await getBoldPaymentVoucher("ORD-1", "k", { fetch: reply(200, "bold-voucher-no-transaction-found.json") })).toEqual({ kind: "none" });
    expect(await getBoldPaymentVoucher("ORD-1", "k", { fetch: reply(404, "bold-404.json") })).toEqual({ kind: "none" });
  });

  it("401/403 o un 400 de autenticación es llave rechazada", async () => {
    expect(await getBoldPaymentVoucher("ORD-1", "k", { fetch: reply(401, "bold-401.json") })).toEqual({ kind: "key-rejected", status: 401 });
    expect(await getBoldPaymentVoucher("ORD-1", "k", { fetch: reply(403, "bold-401.json") })).toEqual({ kind: "key-rejected", status: 403 });
    expect(await getBoldPaymentVoucher("ORD-1", "k", { fetch: reply(400, "bold-401.json") })).toEqual({ kind: "key-rejected", status: 400 });
  });
});
