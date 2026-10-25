import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), recordJobRun: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: { CRON_SECRET: "cron-secret", WOMPI_API_URL: "https://production.wompi.co/v1", WOMPI_API_SECRET: "prv_x" } }));
vi.mock("@/lib/payment-reconciliation", async (importOriginal) => ({
  declineRetryWindowFromEnv: (await importOriginal<typeof import("@/lib/payment-reconciliation")>()).declineRetryWindowFromEnv,
  runPaymentReconciliation: mocks.run,
}));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.recordJobRun }));

import { GET } from "@/app/api/cron/payment-reconciliation/route";

const request = (token?: string) =>
  new Request("https://admin.test/api/cron/payment-reconciliation", { headers: token ? { authorization: `Bearer ${token}` } : {} }) as any;

describe("GET /api/cron/payment-reconciliation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sin el secreto del cron responde 403 sin correr ni tocar Sistemas", async () => {
    const response = await GET(request("otro"));
    expect(response.status).toBe(403);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.recordJobRun).not.toHaveBeenCalled();
  });

  it("con el secreto corre con la llave privada de Wompi y registra la corrida; responde solo cifras", async () => {
    mocks.run.mockResolvedValue({ ok: false, detail: "Llave de Wompi rechazada (HTTP 401) · Revisados 0", checked: 0, paid: 0 });
    const response = await GET(request("cron-secret"));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({
      wompi: { baseUrl: "https://production.wompi.co/v1", privateKey: "prv_x" },
      bold: { identityKey: expect.any(String) },
    });
    expect(mocks.recordJobRun).toHaveBeenCalledWith("payment-reconciliation", { ok: false, detail: "Llave de Wompi rechazada (HTTP 401) · Revisados 0" });
    await expect(response.json()).resolves.toEqual({ ok: false, checked: 0, paid: 0 });
  });

  it("la ventana de reintento solo se acorta con la variable del sandbox", async () => {
    mocks.run.mockResolvedValue({ ok: true, detail: "Revisados 0", checked: 0 });
    vi.stubEnv("PAYMENT_DECLINE_RETRY_WINDOW_MINUTES", "3");
    await GET(request("cron-secret"));
    expect(mocks.run.mock.calls[0][0].declineRetryWindowMs).toBe(3 * 60 * 1000);
    vi.unstubAllEnvs();
    await GET(request("cron-secret"));
    expect(mocks.run.mock.calls[1][0].declineRetryWindowMs).toBeUndefined();
  });

  it("si la corrida lanza, Sistemas queda en rojo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.run.mockRejectedValue(new Error("db down"));
    const response = await GET(request("cron-secret"));
    expect(response.status).toBe(500);
    expect(mocks.recordJobRun).toHaveBeenCalledWith("payment-reconciliation", { ok: false, detail: "La conciliación falló: db down" });
  });
});
