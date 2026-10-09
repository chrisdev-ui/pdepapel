import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { marketplaceConnection: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/mercadolibre/client", () => ({ getMercadoLibreJson: mocks.get }));

import { findItemFromAttempt, readPublishAttempt, withPublishAttempt } from "@/lib/mercadolibre/publish-attempt";

const startedAt = "2026-10-09T15:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ sellerId: "123" });
});

describe("marca de publicación en curso", () => {
  it("se guarda y se lee sin tocar el resto de los metadatos", () => {
    const metadata = withPublishAttempt({ attributes: [{ id: "BRAND" }] }, { startedAt, sku: "CUA-1" });
    expect(metadata).toEqual({ attributes: [{ id: "BRAND" }], publishAttempt: { startedAt, sku: "CUA-1" } });
    expect(readPublishAttempt(metadata)).toEqual({ startedAt, sku: "CUA-1" });
    expect(withPublishAttempt(metadata, null)).toEqual({ attributes: [{ id: "BRAND" }] });
    expect(readPublishAttempt({})).toBeNull();
  });

  it("adopta el ítem con el mismo SKU creado después del intento, y no uno viejo", async () => {
    mocks.get.mockImplementation(async (_c: string, resource: string) => {
      if (resource.includes("seller_sku=")) return { results: ["MCO-VIEJO", "MCO-NUEVO"] };
      if (resource.includes("/items/search?sku=")) return { results: [] };
      return [
        { code: 200, body: { id: "MCO-VIEJO", status: "active", permalink: "p0", date_created: "2026-09-01T00:00:00.000Z" } },
        { code: 200, body: { id: "MCO-NUEVO", status: "active", permalink: "p1", date_created: "2026-10-09T15:00:20.000-05:00" } },
      ];
    });
    await expect(findItemFromAttempt("c1", { startedAt, sku: "CUA-1" })).resolves.toEqual({ id: "MCO-NUEVO", permalink: "p1", status: "active" });
    expect(mocks.get.mock.calls[0][1]).toBe("/users/123/items/search?seller_sku=CUA-1");
  });

  it("sin ítem nuevo devuelve null (se puede crear), y sin SKU no busca", async () => {
    mocks.get.mockResolvedValue({ results: [] });
    await expect(findItemFromAttempt("c1", { startedAt, sku: "CUA-1" })).resolves.toBeNull();
    await expect(findItemFromAttempt("c1", { startedAt, sku: null })).resolves.toBeNull();
  });
});
