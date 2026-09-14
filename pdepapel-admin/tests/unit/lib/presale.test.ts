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
  parsePresaleInput,
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

describe("parsePresaleInput", () => {
  const valido = { productId: "p1", expectedArrivalAt: "2099-01-01", unitLimit: 40 };

  it("acepta una preventa bien formada", () => {
    const parsed = parsePresaleInput(valido);
    expect(parsed.productId).toBe("p1");
    expect(parsed.unitLimit).toBe(40);
    expect(parsed.expectedArrivalAt).toBeInstanceOf(Date);
  });

  it("rechaza una fecha pasada con un mensaje legible, no con un 500", () => {
    // En producción esto devolvía «Error interno del servidor»: handleErrorResponse
    // no distingue un ZodError y lo trata como fallo del sistema.
    try {
      parsePresaleInput({ ...valido, expectedArrivalAt: "2020-01-01" });
      throw new Error("debió rechazar");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
      expect((error as Error).message).toMatch(/futura/i);
    }
  });

  it("habla en español cuando falta un campo, no «Required»", () => {
    // zod responde "Required" en inglés si no se le da required_error, y esto
    // es un panel en español.
    for (const [malo, esperado] of [
      [{ expectedArrivalAt: "2099-01-01", unitLimit: 5 }, /producto/i],
      [{ productId: "p1", unitLimit: 5 }, /fecha/i],
      [{ productId: "p1", expectedArrivalAt: "2099-01-01" }, /unidades/i],
    ] as [Record<string, unknown>, RegExp][]) {
      try {
        parsePresaleInput(malo);
        throw new Error("debió rechazar");
      } catch (error) {
        expect((error as Error).message).not.toBe("Required");
        expect((error as Error).message).toMatch(esperado);
      }
    }
  });

  it("convierte un fallo de esquema en 400 con el mensaje del campo", () => {
    for (const malo of [
      { ...valido, productId: "" },
      { ...valido, unitLimit: 0 },
      { ...valido, unitLimit: 1.5 },
    ]) {
      try {
        parsePresaleInput(malo);
        throw new Error("debió rechazar");
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).toBe(400);
      }
    }
  });
});
