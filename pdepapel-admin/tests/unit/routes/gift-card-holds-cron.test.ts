import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El cron diario de reservas de tarjetas de regalo deja su corrida en
 * «Sistemas» (bien o con errores), igual que los demás diarios: Vercel no
 * reintenta y un día perdido tiene que verse.
 */
const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: "cron-secret" } as Record<string, string | undefined>,
  release: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/gift-cards", () => ({ releaseExpiredGiftCardHolds: mocks.release }));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.record }));

import { GET } from "@/app/api/cron/gift-card-holds/route";

const call = (token?: string) => GET(new Request("https://admin.test/api/cron/gift-card-holds", { headers: token ? { authorization: `Bearer ${token}` } : {} }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cron de reservas de tarjetas de regalo", () => {
  it("registra la corrida con lo liberado", async () => {
    mocks.release.mockResolvedValue({ released: 2, skipped: 5, failed: [] });
    expect((await call("cron-secret")).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith("gift-card-holds", { ok: true, detail: "2 liberada(s), 5 sin cambios" });
  });

  it("una reserva que no se pudo liberar deja la fila en rojo, sin datos del pedido en el detalle", async () => {
    mocks.release.mockResolvedValue({ released: 1, skipped: 0, failed: [{ orderId: "ord-1", error: "boom" }] });
    await call("cron-secret");
    expect(mocks.record).toHaveBeenCalledWith("gift-card-holds", { ok: false, detail: "1 liberada(s), 0 sin cambios, 1 con error" });
    expect(JSON.stringify(mocks.record.mock.calls)).not.toContain("ord-1");
  });

  it("sin el secreto no corre ni registra nada", async () => {
    expect((await call("otro")).status).toBe(403);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
