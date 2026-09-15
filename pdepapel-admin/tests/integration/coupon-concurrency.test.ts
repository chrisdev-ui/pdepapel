import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertCouponHasUses } from "@/lib/coupon-availability";
import { PRESALE_HOLD_WINDOW_MINUTES } from "@/lib/presale";
import { testPrisma } from "./helpers/database";

/**
 * Un cupón de un solo uso no puede repartirse entre dos compras simultáneas.
 * La comprobación cuenta usos pagados más pedidos pendientes, pero eso solo
 * sirve si ocurre dentro de la misma transacción que crea el pedido.
 */
const suffix = randomUUID().slice(0, 8);
let storeId = "";
let couponId = "";

beforeAll(async () => {
  const store = await testPrisma.store.create({
    data: { name: `Cupones ${suffix}`, userId: `owner-${suffix}` },
  });
  storeId = store.id;
});

afterAll(async () => {
  await testPrisma.order.deleteMany({ where: { storeId } });
  await testPrisma.coupon.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
});

beforeEach(async () => {
  await testPrisma.order.deleteMany({ where: { storeId } });
  await testPrisma.coupon.deleteMany({ where: { storeId } });
  const coupon = await testPrisma.coupon.create({
    data: {
      storeId,
      code: `UNICO-${suffix}`,
      type: "FIXED",
      amount: 5000,
      maxUses: 1,
      usedCount: 0,
      isActive: true,
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  couponId = coupon.id;
});

const crearPedido = (tx: typeof testPrisma, etiqueta: string) =>
  tx.order.create({
    data: {
      storeId,
      orderNumber: `ORD-${suffix}-${etiqueta}`,
      status: "PENDING",
      type: "STANDARD",
      fullName: `Clienta ${etiqueta}`,
      phone: "573001112233",
      email: `${etiqueta}@example.com`,
      subtotal: 15000,
      total: 10000,
      couponId,
      couponDiscount: 5000,
    },
  });

/** Comprobar y crear dentro de UNA transacción, como hace el checkout. */
const comprarEnTransaccion = async (etiqueta: string) => {
  const coupon = await testPrisma.coupon.findUniqueOrThrow({
    where: { id: couponId },
  });
  try {
    await testPrisma.$transaction(async (tx) => {
      await assertCouponHasUses(tx as never, coupon);
      await crearPedido(tx as never, etiqueta);
    });
    return "aceptada";
  } catch {
    return "rechazada";
  }
};

describe("un cupón de un solo uso con dos compras a la vez", () => {
  it("solo una compra se lo queda", async () => {
    const resultados = await Promise.all([
      comprarEnTransaccion("a"),
      comprarEnTransaccion("b"),
    ]);

    expect(resultados.filter((r) => r === "aceptada")).toHaveLength(1);

    const conCupon = await testPrisma.order.count({
      where: { storeId, couponId },
    });
    expect(conCupon).toBe(1);
  });

  it("un carrito abandonado deja de reservarlo cuando vence su ventana", async () => {
    await comprarEnTransaccion("a");
    await expect(comprarEnTransaccion("b")).resolves.toBe("rechazada");

    // El pedido sin pagar envejece más allá de la ventana de pasarela.
    await testPrisma.order.updateMany({
      where: { storeId, couponId },
      data: {
        createdAt: new Date(
          Date.now() - (PRESALE_HOLD_WINDOW_MINUTES + 10) * 60_000,
        ),
      },
    });

    await expect(comprarEnTransaccion("c")).resolves.toBe("aceptada");
  });

  it("y con el cupón ya reservado, la siguiente se rechaza", async () => {
    await comprarEnTransaccion("a");

    await expect(comprarEnTransaccion("b")).resolves.toBe("rechazada");
    expect(await testPrisma.order.count({ where: { storeId, couponId } })).toBe(
      1,
    );
  });
});
