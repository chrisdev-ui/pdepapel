import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  pending: vi.fn(),
  record: vi.fn(),
  container: vi.fn(),
  alert: vi.fn(),
  env: { CRON_SECRET: "cron-secret" },
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.record }));
vi.mock("@/lib/whatsapp/webhook-replay", () => ({ countPendingWhatsAppReplays: mocks.pending }));
vi.mock("@/lib/railway-metrics", () => ({ readMysqlContainerMemory: mocks.container }));
vi.mock("@/lib/db-health-alert", () => ({ sendDbHealthAlert: mocks.alert }));
vi.mock("@/lib/db-health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-health")>()),
  readDbHealth: mocks.read,
}));

import { GET } from "@/app/api/cron/db-health/route";

const call = (token?: string) =>
  GET(new Request("https://admin.test/api/cron/db-health", { headers: token ? { authorization: `Bearer ${token}` } : {} }) as never);

describe("GET /api/cron/db-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.mockResolvedValue(0);
    mocks.container.mockResolvedValue({ ok: true, currentGb: 0.5, limitGb: 8, dayAgoGb: 0.48, growthGb: 0.02, at: new Date() });
    mocks.alert.mockResolvedValue("sent");
    mocks.read.mockResolvedValue({ trackedBytes: 600 * 1024 * 1024, uptimeSeconds: 3 * 86400, threadsConnected: 33, maxUsedConnections: 48, maxConnections: 200 });
  });

  it("pide el secreto del cron", async () => {
    expect((await call()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("sin avisos queda en verde en «Sistemas»", async () => {
    const response = await call("cron-secret");
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith("db-health", { ok: true, detail: expect.stringContaining("33 de 200") });
  });

  it("un reinicio reciente o reintentos de WhatsApp pendientes quedan en rojo", async () => {
    mocks.read.mockResolvedValue({ trackedBytes: 600 * 1024 * 1024, uptimeSeconds: 3600, threadsConnected: 10, maxUsedConnections: 10, maxConnections: 200 });
    mocks.pending.mockResolvedValue(1);
    await call("cron-secret");
    expect(mocks.record).toHaveBeenCalledWith("db-health", {
      ok: false,
      detail: expect.stringMatching(/se reinició hace 1 h.*1 evento de WhatsApp/),
    });
  });

  it("si no puede leer la base, la corrida queda en rojo con el motivo", async () => {
    mocks.read.mockRejectedValue(new Error("Can't reach database server"));
    await call("cron-secret");
    expect(mocks.record).toHaveBeenCalledWith("db-health", { ok: false, detail: "Can't reach database server" });
  });

  it("con el contenedor sobre 2 GB queda en rojo y manda el correo", async () => {
    mocks.container.mockResolvedValue({ ok: true, currentGb: 2.3, limitGb: 8, dayAgoGb: 2.2, growthGb: 0.1, at: new Date() });
    const response = await call("cron-secret");
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith("db-health", { ok: false, detail: expect.stringContaining("El contenedor de MySQL usa 2355 MB") });
    expect(mocks.alert).toHaveBeenCalledWith([expect.stringContaining("2355 MB")], expect.stringContaining("Contenedor en Railway: 2355 MB"));
  });

  it("sin lectura de Railway sigue en verde, lo dice en «Sistemas» y no manda correo", async () => {
    mocks.container.mockResolvedValue({ ok: false, reason: "sin lectura de Railway (falta RAILWAY_METRICS_TOKEN)" });
    await call("cron-secret");
    expect(mocks.record).toHaveBeenCalledWith("db-health", { ok: true, detail: expect.stringContaining("sin lectura de Railway") });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("un reinicio sin problema de memoria queda en rojo pero no manda correo", async () => {
    mocks.read.mockResolvedValue({ trackedBytes: 600 * 1024 * 1024, uptimeSeconds: 3600, threadsConnected: 10, maxUsedConnections: 10, maxConnections: 200 });
    await call("cron-secret");
    expect(mocks.record).toHaveBeenCalledWith("db-health", { ok: false, detail: expect.any(String) });
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});
