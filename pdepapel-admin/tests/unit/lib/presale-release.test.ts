import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  presaleFindFirst: vi.fn(),
  presaleUpdate: vi.fn(),
  itemFindMany: vi.fn(),
  itemUpdateMany: vi.fn(),
  productFindFirst: vi.fn(),
  transaction: vi.fn(),
  explode: vi.fn(),
  batch: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    productPresale: {
      findFirst: mocks.presaleFindFirst,
      update: mocks.presaleUpdate,
    },
    orderItem: {
      findMany: mocks.itemFindMany,
      updateMany: mocks.itemUpdateMany,
    },
    product: { findFirst: mocks.productFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/order-stock-movements", () => ({
  explodeKitMovements: mocks.explode,
}));
vi.mock("@/lib/inventory", () => ({
  createInventoryMovementBatchResilient: mocks.batch,
}));

import { releasePresale } from "@/lib/presale-release";

const input = {
  storeId: "store-1",
  presaleId: "presale-1",
  releasedBy: "user-paula",
};

function presale(overrides: Record<string, unknown> = {}) {
  return {
    id: "presale-1",
    status: "ACTIVE",
    productId: "product-1",
    expectedArrivalAt: new Date(),
    unitLimit: 40,
    committedUnits: 3,
    product: {
      id: "product-1",
      name: "Agenda",
      sku: "AGE-01",
      stock: 40,
      isKit: false,
    },
    ...overrides,
  };
}

const LINES = [
  {
    id: "i1",
    orderId: "order-a",
    quantity: 2,
    productId: "product-1",
    order: {
      id: "order-a",
      orderNumber: "ORD-1",
      status: "PAID",
      fullName: "Laura",
    },
  },
  {
    id: "i2",
    orderId: "order-b",
    quantity: 1,
    productId: "product-1",
    order: {
      id: "order-b",
      orderNumber: "ORD-2",
      status: "PAID",
      fullName: "Ana",
    },
  },
];

describe("releasePresale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.presaleFindFirst.mockResolvedValue(presale());
    // 1ª llamada: líneas pendientes. 2ª (dentro de la tx): las que siguen frenadas.
    mocks.itemFindMany.mockResolvedValueOnce(LINES).mockResolvedValue([]);
    mocks.productFindFirst.mockResolvedValue({ acqPrice: 8000, price: 13000 });
    mocks.explode.mockImplementation(async (_tx: unknown, m: unknown[]) => m);
    mocks.batch.mockResolvedValue({ success: [{}, {}], failed: [] });
    mocks.itemUpdateMany.mockResolvedValue({ count: 2 });
    mocks.presaleUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        orderItem: {
          findMany: mocks.itemFindMany,
          updateMany: mocks.itemUpdateMany,
        },
        productPresale: { update: mocks.presaleUpdate },
      }),
    );
  });

  it("descuenta el inventario solo al liberar, con el movimiento de venta", async () => {
    await expect(releasePresale(input)).resolves.toMatchObject({
      releasedUnits: 3,
      releasedOrderIds: ["order-a", "order-b"],
      stillHeldOrderIds: [],
    });

    const movements = mocks.explode.mock.calls[0][1];
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      productId: "product-1",
      type: "ORDER_PLACED",
      quantity: -2,
      createdBy: "user-paula",
    });
  });

  it("marca las líneas como liberadas: eso es lo que suelta el pedido completo", async () => {
    await releasePresale(input);

    // Por id, y solo las que se acaban de descontar: una línea que entrara
    // entre la vista previa y la transacción no tiene movimiento de
    // inventario, así que no puede darse por liberada.
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["i1", "i2"] } },
      data: { preorderReleasedAt: expect.any(Date) },
    });
  });

  it("cierra la campaña dejando quién liberó y cuándo", async () => {
    await releasePresale(input);

    expect(mocks.presaleUpdate).toHaveBeenCalledWith({
      where: { id: "presale-1" },
      data: {
        status: "RELEASED",
        releasedAt: expect.any(Date),
        releasedBy: "user-paula",
      },
    });
  });

  it("se niega si no hay mercancía suficiente en bodega", async () => {
    mocks.presaleFindFirst.mockResolvedValue(
      presale({
        product: {
          id: "product-1",
          name: "Agenda",
          sku: "AGE-01",
          stock: 2,
          isKit: false,
        },
      }),
    );

    await expect(releasePresale(input)).rejects.toThrow(/Faltan unidades/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("no libera nada si una sola línea falló al descontar", async () => {
    // Media liberación dejaría pedidos sueltos sin inventario descontado.
    mocks.batch.mockResolvedValue({
      success: [{}],
      failed: [{ productId: "product-1" }],
    });

    await expect(releasePresale(input)).rejects.toThrow(/No se liberó nada/);
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
    expect(mocks.presaleUpdate).not.toHaveBeenCalled();
  });

  it("deja frenado un pedido que todavía trae OTRA preventa sin liberar", async () => {
    mocks.itemFindMany
      .mockReset()
      .mockResolvedValueOnce(LINES)
      .mockResolvedValue([{ orderId: "order-b" }]);

    await expect(releasePresale(input)).resolves.toMatchObject({
      releasedOrderIds: ["order-a"],
      stillHeldOrderIds: ["order-b"],
    });
  });

  it("se niega sobre una preventa ya liberada", async () => {
    mocks.presaleFindFirst.mockResolvedValue(presale({ status: "RELEASED" }));
    await expect(releasePresale(input)).rejects.toThrow(/ya no está activa/);
  });

  it("se niega cuando no queda nada por liberar", async () => {
    mocks.itemFindMany.mockReset().mockResolvedValue([]);
    await expect(releasePresale(input)).rejects.toThrow(
      /no tiene pedidos pendientes/,
    );
  });
});
