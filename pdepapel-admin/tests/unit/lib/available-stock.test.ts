import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  issues: vi.fn(),
  send: vi.fn(),
  recipients: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "development" } }));
vi.mock("@/lib/prismadb", () => ({ default: { orderInventoryIssue: { findMany: mocks.issues }, stockReservation: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: mocks.recipients }));
vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireOwner }));
vi.mock("@/lib/copiloto/db", () => ({
  withCopilotQuery: (work: (db: unknown) => Promise<unknown>) =>
    work({ product: { findMany: mocks.findMany, fields: { reservedUnits: "FIELD:reservedUnits" } } }),
}));

import { availableStock, kitAvailableFromComponents, marketplaceAvailableStock, netPublicProduct } from "@/lib/available-stock";
import { buildCopilotTools } from "@/lib/copiloto/tools";
import { queueMarketplaceStockSyncEvents } from "@/lib/mercadolibre/outbox";
import { notifyStockShortfall } from "@/lib/stock-review-alerts";

describe("availableStock: la única regla de lo que se puede vender", () => {
  it("resta lo apartado y nunca baja de cero", () => {
    expect(availableStock({ stock: 6, reservedUnits: 2 })).toBe(4);
    expect(availableStock({ stock: 6 })).toBe(6);
    expect(availableStock({ stock: 1, reservedUnits: 3 })).toBe(0);
    expect(availableStock({ stock: -2, reservedUnits: 0 })).toBe(0);
  });

  it("Mercado Libre publica lo disponible menos el colchón", () => {
    expect(marketplaceAvailableStock({ stock: 6, reservedUnits: 2 }, 1)).toBe(3);
    expect(marketplaceAvailableStock({ stock: 3, reservedUnits: 2 }, 2)).toBe(0);
  });

  it("un kit vale lo que su pieza más escasa permite vender", () => {
    expect(
      kitAvailableFromComponents([
        { quantity: 2, component: { stock: 10, reservedUnits: 6 } },
        { quantity: 1, component: { stock: 3, reservedUnits: 0 } },
      ]),
    ).toBe(2);
    expect(kitAvailableFromComponents([])).toBe(0);
  });

  it("la vista pública lleva el stock neto (también piezas y variantes) y nunca el contador", () => {
    const row = {
      id: "p",
      stock: 6,
      reservedUnits: 2,
      kitComponents: [{ quantity: 1, component: { id: "c", stock: 4, reservedUnits: 4 } }],
      products: [{ id: "v", stock: 3, reservedUnits: 1 }],
    };
    const net = netPublicProduct(row);
    expect(net.stock).toBe(4);
    expect(net.kitComponents[0].component.stock).toBe(0);
    expect(net.products[0].stock).toBe(2);
    expect(JSON.stringify(net)).not.toContain("reservedUnits");
    expect(row.stock).toBe(6);
  });
});

describe("Mercado Libre: la sincronización de stock", () => {
  it("encola la cantidad disponible menos el colchón de cada publicación", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const transaction = {
      product: { findMany: vi.fn(async ({ where }: { where: { isKit?: boolean } }) => (where.isKit ? [] : [{ id: "p", stock: 6, reservedUnits: 2 }])) },
      marketplaceListing: { findMany: vi.fn().mockResolvedValue([{ id: "l", connectionId: "c", productId: "p", stockSafetyBuffer: 1 }]) },
      marketplaceOutboxEvent: { upsert },
      productPresale: { findMany: vi.fn().mockResolvedValue([]) },
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await queueMarketplaceStockSyncEvents(transaction as never, ["p"]);
    expect(transaction.product.findMany).toHaveBeenCalledWith({ where: { id: { in: ["p"] } }, select: { id: true, stock: true, reservedUnits: true } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ payload: { targetQuantity: 3 } }) }));
  });
});

describe("Copiloto: el stock que responde es el disponible, con lo apartado aparte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwner.mockResolvedValue(undefined);
  });

  it("buscarProductos filtra por disponible y devuelve stock neto y apartados", async () => {
    mocks.findMany.mockResolvedValue([{ id: "p", name: "Agenda", sku: "AG", price: 20000, stock: 6, reservedUnits: 2, category: { name: "Agendas" } }]);
    const tools = buildCopilotTools("store");
    const result = await tools.buscarProductos.execute!({ texto: "agenda", soloConStock: true, limite: 10 }, { toolCallId: "t", messages: [] } as never);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({ stock: { gt: "FIELD:reservedUnits" } });
    expect(JSON.stringify(result)).toContain('"stock":4');
    expect(JSON.stringify(result)).toContain('"reservados":2');
  });
});

describe("aviso de pedido pagado sin stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recipients.mockResolvedValue(["paula@prueba.test"]);
    mocks.send.mockResolvedValue({});
  });

  it("avisa con los productos que faltaron cuando la transacción ya se confirmó", async () => {
    mocks.issues.mockResolvedValue([{ orderNumber: "ORD-1", productName: "Agenda", quantity: 1 }]);
    await expect(notifyStockShortfall("store", "order", [0])).resolves.toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["paula@prueba.test"],
        subject: "[Revisar] Pedido ORD-1 pagado sin stock suficiente",
        text: expect.stringContaining("• Agenda: faltan 1"),
      }),
    );
  });

  it("no avisa si el pago se deshizo (las incidencias nunca aparecen)", async () => {
    mocks.issues.mockResolvedValue([]);
    await expect(notifyStockShortfall("store", "order", [0, 0])).resolves.toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
