import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    productPresale: {
      count: mocks.count,
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
    },
  },
}));

import { handleErrorResponse } from "@/lib/api-errors";
import {
  ORDER_READY_TO_DISPATCH,
  getPresaleCapacity,
  getProductsWithActivePresale,
  isOrderHeldByPresale,
  isPresaleOverdue,
  overduePresaleWhere,
  parsePresaleInput,
  releasePresaleLinesOnCancellation,
  settlePresaleLinesOnPayment,
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
      isOrderHeldByPresale({
        orderItems: [{ isPreorder: false, preorderReleasedAt: null }],
      }),
    ).toBe(false);
    expect(isOrderHeldByPresale({ orderItems: [] })).toBe(false);
  });

  it("la exclusión de despacho es a nivel de PEDIDO, no de línea", () => {
    // `some` dentro de un NOT: basta una línea sin liberar para sacar el
    // pedido completo de la cola. Si esto se volviera `every`, un pedido mixto
    // se colaría a despacho con la mitad de la mercancía sin llegar.
    expect(ORDER_READY_TO_DISPATCH).toEqual({
      NOT: {
        orderItems: { some: { isPreorder: true, preorderReleasedAt: null } },
      },
    });
  });
});

describe("vencimiento", () => {
  it("está vencida cuando sigue activa y ya pasó la fecha prometida", () => {
    expect(
      isPresaleOverdue({ status: "ACTIVE", expectedArrivalAt: ago(1) }),
    ).toBe(true);
    expect(
      isPresaleOverdue({ status: "ACTIVE", expectedArrivalAt: ahead(1) }),
    ).toBe(false);
  });

  it("una preventa liberada o cancelada nunca está vencida", () => {
    expect(
      isPresaleOverdue({ status: "RELEASED", expectedArrivalAt: ago(30) }),
    ).toBe(false);
    expect(
      isPresaleOverdue({ status: "CANCELLED", expectedArrivalAt: ago(30) }),
    ).toBe(false);
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
      held: 0,
      remaining: 12,
      overCap: 0,
    });
    // Si algo se pasó del tope, «quedan -2» sería peor que «quedan 0».
    expect(
      getPresaleCapacity({ unitLimit: 40, committedUnits: 42 }).remaining,
    ).toBe(0);
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
  const valido = {
    productId: "p1",
    expectedArrivalAt: "2099-01-01",
    unitLimit: 40,
  };

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

  it("habla en español cuando falta un campo, no «Required»", async () => {
    // Se comprueba en la respuesta HTTP, que es donde lo lee una persona:
    // `parsePresaleInput` deja escapar el ZodError y lo traduce
    // `handleErrorResponse`. Antes esta prueba miraba error.message, que en un
    // ZodError es un JSON con los mensajes dentro y pasaba por casualidad.
    for (const [malo, esperado] of [
      [{ expectedArrivalAt: "2099-01-01", unitLimit: 5 }, /producto/i],
      [{ productId: "p1", unitLimit: 5 }, /fecha/i],
      [{ productId: "p1", expectedArrivalAt: "2099-01-01" }, /unidades/i],
    ] as [Record<string, unknown>, RegExp][]) {
      let capturado: unknown;
      try {
        parsePresaleInput(malo);
      } catch (error) {
        capturado = error;
      }
      const response = handleErrorResponse(capturado, "test");
      expect(response.status).toBe(400);
      const cuerpo = (await response.json()) as { error: string };
      expect(cuerpo.error).not.toBe("Required");
      expect(cuerpo.error).not.toBe("Error interno del servidor");
      expect(cuerpo.error).toMatch(esperado);
    }
  });

  it("un valor inválido termina en 400, no en 500", async () => {
    for (const malo of [
      { ...valido, productId: "" },
      { ...valido, unitLimit: 0 },
      { ...valido, unitLimit: 1.5 },
    ]) {
      let capturado: unknown;
      try {
        parsePresaleInput(malo);
      } catch (error) {
        capturado = error;
      }
      expect(handleErrorResponse(capturado, "test").status).toBe(400);
    }
  });
});

/**
 * El cupo se apunta dentro de la transacción del webhook, con la plata ya
 * cobrada. Lo que se prueba aquí es lo que pasa cuando algo de eso falla: el
 * pago tiene que seguir adelante igual.
 */
describe("el cupo nunca tumba un pago confirmado", () => {
  const line = (overrides: Record<string, unknown> = {}) => ({
    id: "line-1",
    quantity: 2,
    presaleId: "campaign-1",
    preorderReleasedAt: null,
    ...overrides,
  });

  const fakeTx = (overrides: Record<string, unknown> = {}) =>
    ({
      orderItem: {
        findMany: vi.fn().mockResolvedValue([line()]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      productPresale: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "campaign-1", releasedAt: null }]),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      ...overrides,
    }) as never;

  it("si el UPDATE del contador falla, el pago sigue y queda el error en el log", async () => {
    const boom = new Error("deadlock");
    const tx = fakeTx({ $executeRaw: vi.fn().mockRejectedValue(boom) });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      settlePresaleLinesOnPayment(tx, "order-1"),
    ).resolves.toBeInstanceOf(Set);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("si no se pueden leer las líneas, no se descuenta inventario por las dudas", async () => {
    const tx = fakeTx({
      orderItem: {
        findMany: vi.fn().mockRejectedValue(new Error("sin conexión")),
      },
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    // Conjunto vacío: ninguna línea de preventa descuenta stock hoy.
    await expect(settlePresaleLinesOnPayment(tx, "order-1")).resolves.toEqual(
      new Set(),
    );
    logged.mockRestore();
  });

  it("un pago tardío que no se puede marcar liberado tampoco descuenta", async () => {
    // Si la marca no se escribe pero el stock sí bajara, el pedido quedaría
    // frenado Y con inventario descontado. Se prefiere no descontar.
    const tx = fakeTx({
      productPresale: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "campaign-1", releasedAt: new Date() }]),
      },
      orderItem: {
        findMany: vi.fn().mockResolvedValue([line()]),
        updateMany: vi.fn().mockRejectedValue(new Error("lock timeout")),
      },
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(settlePresaleLinesOnPayment(tx, "order-1")).resolves.toEqual(
      new Set(),
    );
    logged.mockRestore();
  });

  it("al anular, si devolver el cupo falla, la anulación sigue", async () => {
    const tx = fakeTx({
      $executeRaw: vi.fn().mockRejectedValue(new Error("deadlock")),
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      releasePresaleLinesOnCancellation(tx, "order-1"),
    ).resolves.toEqual(new Set());
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("un pedido sin preventa no consulta campañas ni toca el contador", async () => {
    const tx = fakeTx({
      orderItem: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
    });

    await expect(settlePresaleLinesOnPayment(tx, "order-1")).resolves.toEqual(
      new Set(),
    );
    expect(
      (
        tx as never as {
          productPresale: { findMany: ReturnType<typeof vi.fn> };
        }
      ).productPresale.findMany,
    ).not.toHaveBeenCalled();
    expect(
      (tx as never as { $executeRaw: ReturnType<typeof vi.fn> }).$executeRaw,
    ).not.toHaveBeenCalled();
  });

  it("lee el estado de la línea de la base, no el que traía el webhook", async () => {
    // El pedido que cargó el webhook decía «sin liberar»; Paula liberó en ese
    // intervalo. Manda la base: la línea sí descontó stock y sí lo reingresa.
    const tx = fakeTx({
      orderItem: {
        findMany: vi
          .fn()
          .mockResolvedValue([line({ preorderReleasedAt: new Date() })]),
        updateMany: vi.fn(),
      },
    });

    await expect(
      releasePresaleLinesOnCancellation(tx, "order-1"),
    ).resolves.toEqual(new Set(["line-1"]));
    // Y el cupo no se toca: después de liberar, el contador es historia.
    expect(
      (tx as never as { $executeRaw: ReturnType<typeof vi.fn> }).$executeRaw,
    ).not.toHaveBeenCalled();
  });
});

describe("capacidad con cupo apartado", () => {
  it("lo apartado resta igual que lo vendido", () => {
    expect(
      getPresaleCapacity({ unitLimit: 5, committedUnits: 2, heldUnits: 2 }),
    ).toMatchObject({
      limit: 5,
      committed: 2,
      held: 2,
      remaining: 1,
      overCap: 0,
    });
  });

  it("sin dato de apartadas se comporta como antes", () => {
    expect(
      getPresaleCapacity({ unitLimit: 5, committedUnits: 2 }),
    ).toMatchObject({
      held: 0,
      remaining: 3,
    });
  });

  it("nunca ofrece unidades negativas", () => {
    expect(
      getPresaleCapacity({ unitLimit: 5, committedUnits: 4, heldUnits: 4 })
        .remaining,
    ).toBe(0);
  });

  it("cuenta lo vendido por encima del tope, que un pago no se rechaza", () => {
    expect(
      getPresaleCapacity({ unitLimit: 5, committedUnits: 7 }),
    ).toMatchObject({ remaining: 0, overCap: 2 });
  });

  it("apartadas no suman al exceso: solo cuentan las pagadas", () => {
    expect(
      getPresaleCapacity({ unitLimit: 5, committedUnits: 5, heldUnits: 3 })
        .overCap,
    ).toBe(0);
  });
});
