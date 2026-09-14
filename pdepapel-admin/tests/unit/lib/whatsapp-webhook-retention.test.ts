import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: { marketplaceWebhookEvent: { deleteMany: mocks.deleteMany } },
}));

import {
  WHATSAPP_WEBHOOK_EVENT_RETENTION_DAYS,
  pruneProcessedWhatsAppWebhookEvents,
} from "@/lib/whatsapp/webhook-retention";

const NOW = new Date("2026-09-14T02:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("pruneProcessedWhatsAppWebhookEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("deletes only WhatsApp events already PROCESSED before the cutoff", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 7 });

    const result = await pruneProcessedWhatsAppWebhookEvents({ now: NOW });

    expect(result).toEqual({
      deleted: 7,
      olderThanDays: WHATSAPP_WEBHOOK_EVENT_RETENTION_DAYS,
      cutoff: new Date(NOW.getTime() - WHATSAPP_WEBHOOK_EVENT_RETENTION_DAYS * DAY),
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        provider: "WHATSAPP",
        status: "PROCESSED",
        processedAt: { lt: new Date(NOW.getTime() - 30 * DAY) },
      },
    });
  });

  it("keeps a 30-day window, so anything processed more recently survives", async () => {
    await pruneProcessedWhatsAppWebhookEvents({ now: NOW });

    const { processedAt } = mocks.deleteMany.mock.calls[0][0].where;
    const cutoff = processedAt.lt as Date;

    // Un evento procesado ayer queda por encima del corte: no se borra.
    expect(new Date(NOW.getTime() - 1 * DAY).getTime()).toBeGreaterThan(cutoff.getTime());
    // Uno de hace 31 días queda por debajo: sí entra en el borrado.
    expect(new Date(NOW.getTime() - 31 * DAY).getTime()).toBeLessThan(cutoff.getTime());
  });

  it("never touches events that are not PROCESSED, however old they are", async () => {
    await pruneProcessedWhatsAppWebhookEvents({ now: NOW });

    const { where } = mocks.deleteMany.mock.calls[0][0];
    // El filtro es por igualdad: PENDING, PROCESSING, RETRY y FAILED quedan
    // fuera del borrado porque todavía pueden reintentarse o revisarse.
    expect(where.status).toBe("PROCESSED");
    for (const status of ["PENDING", "PROCESSING", "RETRY", "FAILED"]) {
      expect(where.status).not.toBe(status);
    }
  });

  it("never touches another provider's events", async () => {
    await pruneProcessedWhatsAppWebhookEvents({ now: NOW });

    expect(mocks.deleteMany.mock.calls[0][0].where.provider).toBe("WHATSAPP");
  });

  it("honours a custom retention window", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 2 });

    const result = await pruneProcessedWhatsAppWebhookEvents({ now: NOW, olderThanDays: 7 });

    expect(result.olderThanDays).toBe(7);
    expect(result.cutoff).toEqual(new Date(NOW.getTime() - 7 * DAY));
    expect(mocks.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          processedAt: { lt: new Date(NOW.getTime() - 7 * DAY) },
        }),
      }),
    );
  });

  it("reports zero without failing when there is nothing to delete", async () => {
    await expect(pruneProcessedWhatsAppWebhookEvents({ now: NOW })).resolves.toMatchObject({
      deleted: 0,
    });
  });
});
