/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Ciclo completo de una preventa contra la base de verdad.
 *
 * Cubre las cinco reglas que confirmaron Paula y Christian: se cobra todo por
 * adelantado, el retraso solo se avisa (la plata se devuelve a mano), Mercado
 * Libre queda fuera, el inventario no se entera hasta liberar, y un pedido con
 * preventa espera COMPLETO.
 */

const session = vi.hoisted(() => ({ userId: "user-paula" }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
}));

import {
  ORDER_READY_TO_DISPATCH,
  commitPresaleUnits,
  getActivePresalesByProduct,
  getHeldUnitsByPresale,
  hasActivePresale,
  getPresaleCapacity,
  isOrderHeldByPresale,
  PRESALE_HOLD_WINDOW_MINUTES,
  releasePresaleLinesOnCancellation,
  settlePresaleLinesOnPayment,
} from "@/lib/presale";
import {
  getPresaleCustomers,
  getPresaleReleasePreview,
  recordPresaleDelayNotice,
  releasePresale,
} from "@/lib/presale-release";
import { isReadyToDispatch } from "@/lib/shipment-views";
import { getPresales } from "@/app/(dashboard)/[storeId]/(routes)/preventas/server/get-presales";

const suffix = randomUUID().slice(0, 8);
let storeId = "";
let agendaId = "";
let lapiceroId = "";
let presaleId = "";
let mixedOrderId = "";
let abandonedOrderId = "";
let abandonedLineId = "";

beforeAll(async () => {
  const store = await testPrisma.store.create({
    data: { name: `Preventa ${suffix}`, userId: `owner-${suffix}` },
  });
  storeId = store.id;
  const type = await testPrisma.type.create({
    data: { name: "Papelería", slug: `pap-${suffix}`, storeId },
  });
  const category = await testPrisma.category.create({
    data: { name: "Agendas", slug: `age-${suffix}`, storeId, typeId: type.id },
  });
  const size = await testPrisma.size.create({
    data: { name: "M", value: `m-${suffix}`, storeId },
  });
  const color = await testPrisma.color.create({
    data: { name: "Lavanda", value: `lav-${suffix}`, storeId },
  });
  const design = await testPrisma.design.create({
    data: { name: "Kawaii", storeId },
  });

  const make = (name: string, stock: number) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name}-${suffix}`,
        description: "d",
        stock,
        price: 13000,
        acqPrice: 6000,
        sku: `${name}-${suffix}`,
        storeId,
        categoryId: category.id,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
      },
    });

  // La agenda NO tiene stock: es lo que se vende por adelantado.
  agendaId = (await make("agenda", 0)).id;
  // El lapicero SÍ, y aun así va a esperar por la agenda.
  lapiceroId = (await make("lapicero", 10)).id;
});

describe("1. abrir la preventa", () => {
  it("nace activa, sin unidades reservadas y sin tocar el stock", async () => {
    const presale = await testPrisma.productPresale.create({
      data: {
        storeId,
        productId: agendaId,
        expectedArrivalAt: new Date(Date.now() + 30 * 86400000),
        unitLimit: 40,
        createdBy: "user-paula",
      },
    });
    presaleId = presale.id;

    expect(presale.status).toBe("ACTIVE");
    expect(presale.committedUnits).toBe(0);

    const product = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });
    expect(product?.stock).toBe(0);
  });
});

describe("2. la tienda la ofrece", () => {
  it("la consulta pública devuelve la preventa con su cupo", async () => {
    const map = await getActivePresalesByProduct(storeId, [
      agendaId,
      lapiceroId,
    ]);

    expect(map.has(agendaId)).toBe(true);
    expect(map.has(lapiceroId)).toBe(false);
    expect(getPresaleCapacity(map.get(agendaId)!).remaining).toBe(40);
  });
});

const committedUnits = async (id = presaleId) =>
  (await testPrisma.productPresale.findUnique({ where: { id } }))
    ?.committedUnits;

const mixedOrderItems = () =>
  testPrisma.orderItem.findMany({ where: { orderId: mixedOrderId } });

describe("3. lo que reserva es el pago, no el carrito", () => {
  it("un pedido sin pagar no ocupa cupo ni arrastra mercancía al liberar", async () => {
    const order = await testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-${suffix}`,
        // Nace PENDING, como cualquier pedido en línea: el webhook de Bold o
        // Wompi es el que lo pasa a PAGADO.
        status: "PENDING",
        type: "STANDARD",
        fullName: "Laura",
        phone: "573001112233",
        email: "laura@example.com",
        subtotal: 41000,
        total: 41000,
        orderItems: {
          create: [
            // En bodega, pero va a esperar igual.
            {
              productId: lapiceroId,
              quantity: 1,
              name: "Lapicero",
              sku: "L",
              price: 15000,
            },
            {
              productId: agendaId,
              quantity: 3,
              name: "Agenda",
              sku: "A",
              price: 13000,
              isPreorder: true,
              presaleId,
            },
          ],
        },
      },
    });
    mixedOrderId = order.id;

    expect(await committedUnits()).toBe(0);

    // Lo que de verdad importa de esta regla: si el carrito contara, Paula
    // liberaría —y descontaría inventario de— 3 agendas que nadie compró.
    const preview = await getPresaleReleasePreview(storeId, presaleId);
    expect(preview.pendingUnits).toBe(0);
    expect(preview.canRelease).toBe(false);
  });

  it("al confirmarse el pago sube el cupo y la línea sigue esperando", async () => {
    const dispatchNow = await testPrisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: mixedOrderId },
        data: { status: "PAID" },
      });
      return settlePresaleLinesOnPayment(tx, mixedOrderId);
    });

    // Nada que despachar hoy: la mercancía sigue sin llegar.
    expect(dispatchNow.size).toBe(0);
    expect(await committedUnits()).toBe(3);

    const map = await getActivePresalesByProduct(storeId, [agendaId]);
    expect(getPresaleCapacity(map.get(agendaId)!).remaining).toBe(37);

    // El inventario sigue sin enterarse: el stock se descuenta al liberar.
    const agenda = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });
    expect(agenda?.stock).toBe(0);
    const movements = await testPrisma.inventoryMovement.count({
      where: { productId: agendaId },
    });
    expect(movements).toBe(0);
  });

  it("anular el pago devuelve el cupo sin inventar mercancía", async () => {
    const restock = await testPrisma.$transaction((tx) =>
      releasePresaleLinesOnCancellation(tx, mixedOrderId),
    );

    // La línea nunca descontó stock, así que tampoco lo reingresa.
    expect(restock.size).toBe(0);
    expect(await committedUnits()).toBe(0);

    // Se vuelve a pagar para seguir el ciclo donde estaba.
    await testPrisma.$transaction((tx) =>
      settlePresaleLinesOnPayment(tx, mixedOrderId),
    );
    expect(await committedUnits()).toBe(3);
  });

  it("dos pagos simultáneos suman los dos", async () => {
    const small = await testPrisma.productPresale.create({
      data: {
        storeId,
        productId: lapiceroId,
        expectedArrivalAt: new Date(Date.now() + 10 * 86400000),
        unitLimit: 2,
      },
    });

    await Promise.all([
      testPrisma.$transaction((tx) => commitPresaleUnits(tx, small.id, 1)),
      testPrisma.$transaction((tx) => commitPresaleUnits(tx, small.id, 1)),
    ]);
    // Ninguna se pierde: el incremento viaja dentro de la sentencia.
    expect(await committedUnits(small.id)).toBe(2);

    // El tope se hace valer en el checkout, que es donde todavía se puede
    // decir que no; aquí la plata ya entró y el contador dice la verdad,
    // aunque quede por encima. Lo que nunca se ve es un cupo negativo.
    await testPrisma.$transaction((tx) => commitPresaleUnits(tx, small.id, 5));
    const after = await testPrisma.productPresale.findUnique({
      where: { id: small.id },
    });
    expect(after?.committedUnits).toBe(7);
    expect(getPresaleCapacity(after!).remaining).toBe(0);

    await testPrisma.productPresale.delete({ where: { id: small.id } });
  });

  it("un pago que llega después de liberar despacha como una venta normal", async () => {
    // La clienta pagó el enlace días tarde, con la campaña ya cerrada. Sin
    // esto su pedido quedaría frenado para siempre: «Liberar» ya no vuelve a
    // pasar por ahí.
    const closed = await testPrisma.productPresale.create({
      data: {
        storeId,
        productId: lapiceroId,
        expectedArrivalAt: new Date(Date.now() - 86400000),
        unitLimit: 5,
        status: "RELEASED",
        releasedAt: new Date(),
      },
    });
    const late = await testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-TARDE-${suffix}`,
        status: "PENDING",
        type: "STANDARD",
        fullName: "Sofía",
        phone: "573001112244",
        email: "sofia@example.com",
        subtotal: 15000,
        total: 15000,
        orderItems: {
          create: [
            {
              productId: lapiceroId,
              quantity: 1,
              name: "Lapicero",
              sku: "L",
              price: 15000,
              isPreorder: true,
              presaleId: closed.id,
            },
          ],
        },
      },
      include: { orderItems: true },
    });

    const dispatchNow = await testPrisma.$transaction((tx) =>
      settlePresaleLinesOnPayment(tx, late.id),
    );

    // Descuenta hoy, como cualquier venta, y el pedido queda suelto.
    expect(dispatchNow.has(late.orderItems[0].id)).toBe(true);
    const line = await testPrisma.orderItem.findUnique({
      where: { id: late.orderItems[0].id },
    });
    expect(line?.preorderReleasedAt).toBeInstanceOf(Date);
    // El contador de una campaña cerrada ya es historia: no se reescribe.
    expect(await committedUnits(closed.id)).toBe(0);

    await testPrisma.orderItem.deleteMany({ where: { orderId: late.id } });
    await testPrisma.order.delete({ where: { id: late.id } });
    await testPrisma.productPresale.delete({ where: { id: closed.id } });
  });
});

describe("3b. el cupo apartado por pedidos sin pagar", () => {
  let campanaId = "";
  const pedidos: string[] = [];

  const pedirSinPagar = async (
    units: number,
    opts: {
      minutesAgo?: number;
      status?: "PENDING" | "CANCELLED" | "PAID";
      guestId?: string;
    } = {},
  ) => {
    const created = await testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-HOLD-${suffix}-${pedidos.length}`,
        status: opts.status ?? "PENDING",
        type: "STANDARD",
        fullName: "Clienta",
        phone: "573001110000",
        email: "clienta@example.com",
        guestId: opts.guestId ?? null,
        subtotal: 1000,
        total: 1000,
        orderItems: {
          create: [
            {
              productId: lapiceroId,
              quantity: units,
              name: "Lapicero",
              sku: "L",
              price: 1000,
              isPreorder: true,
              presaleId: campanaId,
            },
          ],
        },
      },
    });
    if (opts.minutesAgo) {
      await testPrisma.order.update({
        where: { id: created.id },
        data: { createdAt: new Date(Date.now() - opts.minutesAgo * 60000) },
      });
    }
    pedidos.push(created.id);
    return created.id;
  };

  beforeAll(async () => {
    const campana = await testPrisma.productPresale.create({
      data: {
        storeId,
        productId: lapiceroId,
        expectedArrivalAt: new Date(Date.now() + 20 * 86400000),
        unitLimit: 5,
      },
    });
    campanaId = campana.id;
  });

  afterAll(async () => {
    await testPrisma.orderItem.deleteMany({
      where: { orderId: { in: pedidos } },
    });
    await testPrisma.order.deleteMany({ where: { id: { in: pedidos } } });
    await testPrisma.productPresale.delete({ where: { id: campanaId } });
  });

  it("un pedido reciente sin pagar aparta cupo", async () => {
    await pedirSinPagar(2);

    const held = await getHeldUnitsByPresale([campanaId]);
    expect(held.get(campanaId)).toBe(2);

    const map = await getActivePresalesByProduct(storeId, [lapiceroId]);
    expect(getPresaleCapacity(map.get(lapiceroId)!).remaining).toBe(3);
  });

  it("uno viejo se da por abandonado y su unidad vuelve a la venta", async () => {
    await pedirSinPagar(2, { minutesAgo: PRESALE_HOLD_WINDOW_MINUTES + 1 });

    const held = await getHeldUnitsByPresale([campanaId]);
    // Solo las 2 del pedido reciente.
    expect(held.get(campanaId)).toBe(2);
  });

  it("un pedido cancelado no aparta nada", async () => {
    await pedirSinPagar(2, { status: "CANCELLED" });

    const held = await getHeldUnitsByPresale([campanaId]);
    expect(held.get(campanaId)).toBe(2);
  });

  it("los pagados no se cuentan dos veces: ya están en el contador", async () => {
    const pagado = await pedirSinPagar(1, { status: "PAID" });
    await testPrisma.$transaction((tx) =>
      settlePresaleLinesOnPayment(tx, pagado),
    );

    const held = await getHeldUnitsByPresale([campanaId]);
    expect(held.get(campanaId)).toBe(2);

    const map = await getActivePresalesByProduct(storeId, [lapiceroId]);
    const capacidad = getPresaleCapacity(map.get(lapiceroId)!);
    // 5 de tope − 1 pagada − 2 apartadas.
    expect(capacidad).toMatchObject({ committed: 1, held: 2, remaining: 2 });
  });

  it("a quien le rebotó la tarjeta no le cuenta su propio intento", async () => {
    await pedirSinPagar(2, { guestId: "invitada-que-reintenta" });

    const conTodo = await getHeldUnitsByPresale([campanaId]);
    expect(conTodo.get(campanaId)).toBe(4);

    const sinLoSuyo = await getHeldUnitsByPresale([campanaId], {
      excludeOrdersOf: { guestId: "invitada-que-reintenta" },
    });
    expect(sinLoSuyo.get(campanaId)).toBe(2);
  });

  it("una transferencia bancaria aparta más tiempo que una pasarela", async () => {
    // Una transferencia queda PENDING hasta que Paula la confirma a mano, así
    // que con la ventana corta se soltaría una reserva que sí van a pagar.
    const viejo = PRESALE_HOLD_WINDOW_MINUTES + 60;
    const conPasarela = await pedirSinPagar(1, { minutesAgo: viejo });
    const conTransferencia = await pedirSinPagar(1, { minutesAgo: viejo });

    for (const [orderId, method] of [
      [conPasarela, "Bold"],
      [conTransferencia, "BankTransfer"],
    ] as const) {
      await testPrisma.paymentDetails.create({
        data: { orderId, storeId, method },
      });
    }

    const held = await getHeldUnitsByPresale([campanaId]);
    // Las 4 de antes + solo la de la transferencia: la de pasarela ya venció.
    expect(held.get(campanaId)).toBe(5);
  });

  it("un pago tardío fuera de la ventana entra igual y se ve el exceso", async () => {
    // El pedido ya no apartaba nada y el tope se llenó mientras tanto: la
    // plata entró, así que se apunta y el descuadre queda a la vista en vez de
    // rechazar un pago que el banco ya cobró.
    await testPrisma.productPresale.update({
      where: { id: campanaId },
      data: { committedUnits: 5 },
    });
    const tardio = await pedirSinPagar(2, {
      minutesAgo: PRESALE_HOLD_WINDOW_MINUTES + 60,
    });
    await testPrisma.order.update({
      where: { id: tardio },
      data: { status: "PAID" },
    });

    await testPrisma.$transaction((tx) =>
      settlePresaleLinesOnPayment(tx, tardio),
    );

    const campana = await testPrisma.productPresale.findUnique({
      where: { id: campanaId },
    });
    expect(campana?.committedUnits).toBe(7);

    const capacidad = getPresaleCapacity({ ...campana!, heldUnits: 0 });
    expect(capacidad).toMatchObject({ remaining: 0, overCap: 2 });
  });
});

describe("4. el pedido mixto", () => {
  it("guarda la línea de preventa marcada y sin descontar inventario", async () => {
    const items = await mixedOrderItems();

    const presaleLine = items.find((item) => item.isPreorder);
    expect(presaleLine?.preorderReleasedAt).toBeNull();
    expect(presaleLine?.presaleId).toBe(presaleId);

    // El stock de la agenda sigue en 0: la venta todavía no lo tocó.
    const agenda = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });
    expect(agenda?.stock).toBe(0);
  });
});

describe("4b. la pantalla delata un contador descuadrado", () => {
  it("cuenta las unidades pagadas una por una y avisa si el cupo no cuadra", async () => {
    const sano = await getPresales(storeId);
    const fila = sano.rows.find((row) => row.id === presaleId)!;
    expect(fila).toMatchObject({
      paidUnits: 3,
      committedUnits: 3,
      counterDrift: 0,
    });

    // Así se vería un apunte de cupo que falló en el webhook: el pago entró
    // igual —nunca se tumba un pago por el contador— y el descuadre queda a la
    // vista en vez de vivir solo en los registros del servidor.
    await testPrisma.productPresale.update({
      where: { id: presaleId },
      data: { committedUnits: 1 },
    });

    const descuadrado = await getPresales(storeId);
    const rota = descuadrado.rows.find((row) => row.id === presaleId)!;
    expect(rota.paidUnits).toBe(3);
    expect(rota.counterDrift).toBe(2);

    await testPrisma.productPresale.update({
      where: { id: presaleId },
      data: { committedUnits: 3 },
    });
  });
});

describe("5. el pedido ENTERO espera", () => {
  it("una sola línea sin liberar frena todo el pedido", async () => {
    const order = await testPrisma.order.findUnique({
      where: { id: mixedOrderId },
      select: {
        orderItems: { select: { isPreorder: true, preorderReleasedAt: true } },
      },
    });

    expect(isOrderHeldByPresale(order!)).toBe(true);
    expect(
      isReadyToDispatch({
        status: "Preparing",
        createdAt: new Date(),
        updatedAt: new Date(),
        order: { status: "PAID", type: "STANDARD", heldByPresale: true },
      } as never),
    ).toBe(false);
  });

  it("la consulta de despacho lo deja fuera", async () => {
    const dispatchable = await testPrisma.order.count({
      where: { storeId, status: "PAID", ...ORDER_READY_TO_DISPATCH },
    });
    expect(dispatchable).toBe(0);
  });
});

describe("6. avisar un retraso", () => {
  it("anota quién y cuándo, y no toca pedido, pago ni inventario", async () => {
    const before = await testPrisma.order.findUnique({
      where: { id: mixedOrderId },
    });
    const agendaBefore = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });

    const customers = await getPresaleCustomers(storeId, presaleId);
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ fullName: "Laura", units: 3 });

    const noticed = await recordPresaleDelayNotice({
      storeId,
      presaleId,
      notifiedBy: "user-paula",
    });
    expect(noticed.delayNotifiedAt).toBeInstanceOf(Date);
    expect(noticed.delayNotifiedBy).toBe("user-paula");

    const after = await testPrisma.order.findUnique({
      where: { id: mixedOrderId },
    });
    const agendaAfter = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });
    // Ni el estado, ni el total, ni el stock: solo se avisó.
    expect(after?.status).toBe(before?.status);
    expect(after?.total).toBe(before?.total);
    expect(agendaAfter?.stock).toBe(agendaBefore?.stock);

    const movements = await testPrisma.inventoryMovement.count({
      where: { productId: agendaId },
    });
    expect(movements).toBe(0);
  });
});

describe("6b. Mercado Libre queda fuera", () => {
  it("el candado se enciende aunque el producto tenga stock de sobra", async () => {
    // El caso costoso: al liberar, el stock sube de golpe con la mercancía que
    // llegó. Si el candado dependiera del stock, ML vendería unidades ya
    // cobradas. Se pone stock alto A PROPÓSITO para comprobar que da igual.
    await testPrisma.product.update({
      where: { id: agendaId },
      data: { stock: 40 },
    });

    await expect(hasActivePresale(agendaId)).resolves.toBe(true);

    // El lapicero no tiene preventa activa: se publica con normalidad.
    await expect(hasActivePresale(lapiceroId)).resolves.toBe(false);

    // Se devuelve el stock a 0 para que el bloque 7 pruebe que liberar se
    // niega sin mercancía.
    await testPrisma.product.update({
      where: { id: agendaId },
      data: { stock: 0 },
    });
  });

  it("deja de aplicar en cuanto la preventa ya no está activa", async () => {
    const otro = await testPrisma.productPresale.create({
      data: {
        storeId,
        productId: lapiceroId,
        expectedArrivalAt: new Date(Date.now() + 5 * 86400000),
        unitLimit: 5,
        status: "RELEASED",
      },
    });

    // RELEASED no bloquea: el producto vuelve a Mercado Libre.
    await expect(hasActivePresale(lapiceroId)).resolves.toBe(false);
    await testPrisma.productPresale.delete({ where: { id: otro.id } });
  });
});

describe("7. liberar", () => {
  it("un carrito abandonado no arrastra mercancía a la liberación", async () => {
    // El error caro: contar líneas sin pagar al liberar descuenta inventario
    // por ventas que no existen y deja al pedido de verdad sin unidades.
    const abandonado = await testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-ABAND-${suffix}`,
        status: "PENDING",
        type: "STANDARD",
        fullName: "Carrito abandonado",
        phone: "573000000000",
        email: "nadie@example.com",
        subtotal: 26000,
        total: 26000,
        orderItems: {
          create: [
            {
              productId: agendaId,
              quantity: 2,
              name: "Agenda",
              sku: "A",
              price: 13000,
              isPreorder: true,
              presaleId,
            },
          ],
        },
      },
      include: { orderItems: true },
    });
    abandonedOrderId = abandonado.id;
    abandonedLineId = abandonado.orderItems[0].id;

    const preview = await getPresaleReleasePreview(storeId, presaleId);
    // Las 3 pagadas, no las 5 que hay en la tabla.
    expect(preview.pendingUnits).toBe(3);
    expect(preview.lines).toHaveLength(1);
  });

  it("se niega mientras no haya llegado la mercancía", async () => {
    await expect(
      releasePresale({ storeId, presaleId, releasedBy: "user-paula" }),
    ).rejects.toThrow(/Faltan unidades/);
  });

  it("descuenta inventario, libera las líneas y cierra la campaña", async () => {
    // Llega la mercancía.
    await testPrisma.product.update({
      where: { id: agendaId },
      data: { stock: 40 },
    });

    const result = await releasePresale({
      storeId,
      presaleId,
      releasedBy: "user-paula",
    });

    expect(result.releasedUnits).toBe(3);
    expect(result.releasedOrderIds).toEqual([mixedOrderId]);
    expect(result.stillHeldOrderIds).toEqual([]);

    // Inventario: movimiento real de venta, y el stock baja de 40 a 37.
    const movements = await testPrisma.inventoryMovement.findMany({
      where: { productId: agendaId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "ORDER_PLACED", quantity: -3 });

    const agenda = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });
    expect(agenda?.stock).toBe(37);

    // La línea PAGADA queda liberada y la campaña cerrada. Se busca por el
    // pedido y no por la preventa: el carrito abandonado comparte campaña y
    // sigue —con razón— sin liberar.
    const line = await testPrisma.orderItem.findFirst({
      where: { presaleId, orderId: mixedOrderId },
    });
    expect(line?.preorderReleasedAt).toBeInstanceOf(Date);

    const presale = await testPrisma.productPresale.findUnique({
      where: { id: presaleId },
    });
    expect(presale).toMatchObject({
      status: "RELEASED",
      releasedBy: "user-paula",
    });
  });

  it("el carrito abandonado sigue intacto: ni liberado ni descontado", async () => {
    const line = await testPrisma.orderItem.findUnique({
      where: { id: abandonedLineId },
    });
    expect(line?.preorderReleasedAt).toBeNull();

    // Se descontaron 3 (las pagadas), no 5.
    const agenda = await testPrisma.product.findUnique({
      where: { id: agendaId },
    });
    expect(agenda?.stock).toBe(37);

    await testPrisma.orderItem.deleteMany({
      where: { orderId: abandonedOrderId },
    });
    await testPrisma.order.delete({ where: { id: abandonedOrderId } });
  });

  it("el pedido ya se puede despachar", async () => {
    const order = await testPrisma.order.findUnique({
      where: { id: mixedOrderId },
      select: {
        orderItems: { select: { isPreorder: true, preorderReleasedAt: true } },
      },
    });
    expect(isOrderHeldByPresale(order!)).toBe(false);

    const dispatchable = await testPrisma.order.count({
      where: { storeId, status: "PAID", ...ORDER_READY_TO_DISPATCH },
    });
    expect(dispatchable).toBe(1);
  });
});
