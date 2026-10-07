import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { marketplaceListing: { updateMany: mocks.updateMany } } }));

import { synchronizeMercadoLibreItemStatus } from "@/lib/mercadolibre/item-sync";

/**
 * #8: Mercado Libre pausó solas cuatro publicaciones al quedar sin stock y el
 * panel las siguió mostrando «Activa» semanas después. El aviso `items`
 * trae el estado real.
 */
describe("synchronizeMercadoLibreItemStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("mirrors a pause done by Mercado Libre onto the local listing, only on mirrored statuses", async () => {
    await expect(
      synchronizeMercadoLibreItemStatus("conn-1", { id: "MCO4139182068", status: "paused", last_updated: "2026-08-25T03:21:00.000Z" }),
    ).resolves.toEqual({ updated: 1 });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { connectionId: "conn-1", externalItemId: "MCO4139182068", status: { in: ["ACTIVE", "PAUSED", "CLOSED"] } },
      data: { status: "PAUSED", lastRemoteUpdateAt: new Date("2026-08-25T03:21:00.000Z") },
    });
  });

  it("maps active and closed, and ignores a payload without id or status", async () => {
    await synchronizeMercadoLibreItemStatus("conn-1", { id: "MCO1", status: "active" });
    await synchronizeMercadoLibreItemStatus("conn-1", { id: "MCO1", status: "closed" });
    expect(mocks.updateMany.mock.calls.map((call) => call[0].data.status)).toEqual(["ACTIVE", "CLOSED"]);

    await expect(synchronizeMercadoLibreItemStatus("conn-1", { status: "paused" })).resolves.toEqual({ updated: 0 });
    await expect(synchronizeMercadoLibreItemStatus("conn-1", { id: "MCO1" })).resolves.toEqual({ updated: 0 });
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });
});
