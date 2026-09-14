import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    productPresale: {
      count: mocks.count,
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
    },
  },
}));

import {
  ORDER_READY_TO_DISPATCH,
  getPresaleCapacity,
  getProductsWithActivePresale,
  isOrderHeldByPresale,
  isPresaleOverdue,
  overduePresaleWhere,
} from "@/lib/presale";

const ago = (days: number) => new Date(Date.now() - days * 86400000);
const ahead = (days: number) => new Date(Date.now() + days * 86400000);

describe("regla 5: el pedido entero espera", () => {
  it("frena el pedido aunque solo UNA línea sea preventa sin liberar", () => {
    expect(
      isOrderHeldByPresale({
        orderItems: [
          // Este lapicero está en bodega y aun así no sale.
          { isPreorder: false, preorderReleasedAt: null },
          { isPreorder: true, preorderReleasedAt: null },
        ],
      }),
    ).toBe(true);
  });

  it("suelta el pedido cuando todas las preventas están liberadas", () => {
    expect(
      isOrderHeldByPresale({
        orderItems: [
          { isPreorder: false, preorderReleasedAt: null },
          { isPreorder: true, preorderReleasedAt: new Date() },
        ],
      }),
    ).toBe(false);
  });

  it("un pedido normal nunca queda frenado", () => {
    expect(
      isOrderHeldByPresale({ orderItems: [{ isPreorder: false, preorderReleasedAt: null }] }),
    ).toBe(false);
    expect(isOrderHeldByPresale({ orderItems: [] })).toBe(false);
  });

  it("la exclusión de despacho es a nivel de PEDIDO, no de línea", () => {
    // `some` dentro de un NOT: basta una línea sin liberar para sacar el
    // pedido completo de la cola. Si esto se volviera `every`, un pedido mixto
    // se colaría a despacho con la mitad de la mercancía sin llegar.
    expect(ORDER_READY_TO_DISPATCH).toEqual({
      NOT: { orderItems: { some: { isPreorder: true, preorderReleasedAt: null } } },
    });
  });
});

describe("vencimiento", () => {
  it("está vencida cuando sigue activa y ya pasó la fecha prometida", () => {
    expect(isPresaleOverdue({ status: "ACTIVE", expectedArrivalAt: ago(1) })).toBe(true);
    expect(isPresaleOverdue({ status: "ACTIVE", expectedArrivalAt: ahead(1) })).toBe(false);
  });

  it("una preventa liberada o cancelada nunca está vencida", () => {
    expect(isPresaleOverdue({ status: "RELEASED", expectedArrivalAt: ago(30) })).toBe(false);
    expect(isPresaleOverdue({ status: "CANCELLED", expectedArrivalAt: ago(30) })).toBe(false);
  });

  it("la consulta busca lo mismo que la función", () => {
    const now = new Date();
    expect(overduePresaleWhere(now)).toEqual({
      status: "ACTIVE",
      expectedArrivalAt: { lt: now },
    });
  });
});

describe("capacidad", () => {
  it("cuenta lo que queda sin bajar de cero", () => {
    expect(getPresaleCapacity({ unitLimit: 40, committedUnits: 28 })).toEqual({
      limit: 40,
      committed: 28,
      remaining: 12,
    });
    // Si algo se pasó del tope, «quedan -2» sería peor que «quedan 0».
    expect(getPresaleCapacity({ unitLimit: 40, committedUnits: 42 }).remaining).toBe(0);
  });
});

describe("regla 3: Mercado Libre", () => {
  it("pregunta solo por preventas activas", async () => {
    mocks.findMany.mockResolvedValue([{ productId: "p1" }]);

    await expect(getProductsWithActivePresale(["p1", "p2"])).resolves.toEqual(
      new Set(["p1"]),
    );
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { productId: { in: ["p1", "p2"] }, status: "ACTIVE" },
      select: { productId: true },
    });
  });

  it("no consulta nada con una lista vacía", async () => {
    mocks.findMany.mockClear();
    await expect(getProductsWithActivePresale([])).resolves.toEqual(new Set());
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
