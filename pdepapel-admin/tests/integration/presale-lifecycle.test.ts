/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
  getActivePresalesByProduct,
  hasActivePresale,
  getPresaleCapacity,
  isOrderHeldByPresale,
  reservePresaleUnits,
} from "@/lib/presale";
import {
  getPresaleCustomers,
  recordPresaleDelayNotice,
  releasePresale,
} from "@/lib/presale-release";
import { isReadyToDispatch } from "@/lib/shipment-views";

const suffix = randomUUID().slice(0, 8);
let storeId = "";
let agendaId = "";
let lapiceroId = "";
let presaleId = "";
let mixedOrderId = "";

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

    const product = await testPrisma.product.findUnique({ where: { id: agendaId } });
    expect(product?.stock).toBe(0);
  });
});

describe("2. la tienda la ofrece", () => {
  it("la consulta pública devuelve la preventa con su cupo", async () => {
    const map = await getActivePresalesByProduct(storeId, [agendaId, lapiceroId]);

    expect(map.has(agendaId)).toBe(true);
    expect(map.has(lapiceroId)).toBe(false);
    expect(getPresaleCapacity(map.get(agendaId)!).remaining).toBe(40);
  });
});

describe("3. reservar", () => {
  it("sube el contador de forma atómica sin pasarse del tope", async () => {
    const ok = await testPrisma.$transaction((tx) =>
      reservePresaleUnits(tx, presaleId, 3),
    );
    expect(ok).toBe(true);

    const after = await testPrisma.productPresale.findUnique({ where: { id: presaleId } });
    expect(after?.committedUnits).toBe(3);
  });

  it("se niega cuando lo pedido no cabe en el tope", async () => {
    const ok = await testPrisma.$transaction((tx) =>
      reservePresaleUnits(tx, presaleId, 100),
    );
    expect(ok).toBe(false);

    const after = await testPrisma.productPresale.findUnique({ where: { id: presaleId } });
    // No se movió: la condición viaja dentro de la sentencia.
    expect(after?.committedUnits).toBe(3);
  });

  it("dos reservas simultáneas no se pasan del tope", async () => {
    const small = await testPrisma.productPresale.create({
      data: {
        storeId,
        productId: lapiceroId,
        expectedArrivalAt: new Date(Date.now() + 10 * 86400000),
        unitLimit: 2,
      },
    });

    const results = await Promise.all([
      testPrisma.$transaction((tx) => reservePresaleUnits(tx, small.id, 2)),
      testPrisma.$transaction((tx) => reservePresaleUnits(tx, small.id, 2)),
    ]);

    // Una entra y la otra no; nunca las dos.
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = await testPrisma.productPresale.findUnique({ where: { id: small.id } });
    expect(after?.committedUnits).toBe(2);

    await testPrisma.productPresale.delete({ where: { id: small.id } });
  });
});

describe("4. el pedido mixto", () => {
  it("guarda la línea de preventa marcada y sin descontar inventario", async () => {
    const order = await testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-${suffix}`,
        status: "PAID",
        type: "STANDARD",
        fullName: "Laura",
        phone: "573001112233",
        email: "laura@example.com",
        subtotal: 41000,
        total: 41000,
        orderItems: {
          create: [
            // En bodega, pero va a esperar igual.
            { productId: lapiceroId, quantity: 1, name: "Lapicero", sku: "L", price: 15000 },
            { productId: agendaId, quantity: 3, name: "Agenda", sku: "A", price: 13000, isPreorder: true, presaleId },
          ],
        },
      },
      include: { orderItems: true },
    });
    mixedOrderId = order.id;

    const presaleLine = order.orderItems.find((item) => item.isPreorder);
    expect(presaleLine?.preorderReleasedAt).toBeNull();
    expect(presaleLine?.presaleId).toBe(presaleId);

    // El stock de la agenda sigue en 0: la venta todavía no lo tocó.
    const agenda = await testPrisma.product.findUnique({ where: { id: agendaId } });
    expect(agenda?.stock).toBe(0);
  });
});

describe("5. el pedido ENTERO espera", () => {
  it("una sola línea sin liberar frena todo el pedido", async () => {
    const order = await testPrisma.order.findUnique({
      where: { id: mixedOrderId },
      select: { orderItems: { select: { isPreorder: true, preorderReleasedAt: true } } },
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
    const before = await testPrisma.order.findUnique({ where: { id: mixedOrderId } });
    const agendaBefore = await testPrisma.product.findUnique({ where: { id: agendaId } });

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

    const after = await testPrisma.order.findUnique({ where: { id: mixedOrderId } });
    const agendaAfter = await testPrisma.product.findUnique({ where: { id: agendaId } });
    // Ni el estado, ni el total, ni el stock: solo se avisó.
    expect(after?.status).toBe(before?.status);
    expect(after?.total).toBe(before?.total);
    expect(agendaAfter?.stock).toBe(agendaBefore?.stock);

    const movements = await testPrisma.inventoryMovement.count({ where: { productId: agendaId } });
    expect(movements).toBe(0);
  });
});

describe("6b. Mercado Libre queda fuera", () => {
  it("el candado se enciende aunque el producto tenga stock de sobra", async () => {
    // El caso costoso: al liberar, el stock sube de golpe con la mercancía que
    // llegó. Si el candado dependiera del stock, ML vendería unidades ya
    // cobradas. Se pone stock alto A PROPÓSITO para comprobar que da igual.
    await testPrisma.product.update({ where: { id: agendaId }, data: { stock: 40 } });

    await expect(hasActivePresale(agendaId)).resolves.toBe(true);

    // El lapicero no tiene preventa activa: se publica con normalidad.
    await expect(hasActivePresale(lapiceroId)).resolves.toBe(false);

    // Se devuelve el stock a 0 para que el bloque 7 pruebe que liberar se
    // niega sin mercancía.
    await testPrisma.product.update({ where: { id: agendaId }, data: { stock: 0 } });
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
  it("se niega mientras no haya llegado la mercancía", async () => {
    await expect(
      releasePresale({ storeId, presaleId, releasedBy: "user-paula" }),
    ).rejects.toThrow(/Faltan unidades/);
  });

  it("descuenta inventario, libera las líneas y cierra la campaña", async () => {
    // Llega la mercancía.
    await testPrisma.product.update({ where: { id: agendaId }, data: { stock: 40 } });

    const result = await releasePresale({ storeId, presaleId, releasedBy: "user-paula" });

    expect(result.releasedUnits).toBe(3);
    expect(result.releasedOrderIds).toEqual([mixedOrderId]);
    expect(result.stillHeldOrderIds).toEqual([]);

    // Inventario: movimiento real de venta, y el stock baja de 40 a 37.
    const movements = await testPrisma.inventoryMovement.findMany({
      where: { productId: agendaId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "ORDER_PLACED", quantity: -3 });

    const agenda = await testPrisma.product.findUnique({ where: { id: agendaId } });
    expect(agenda?.stock).toBe(37);

    // La línea queda liberada y la campaña cerrada.
    const line = await testPrisma.orderItem.findFirst({ where: { presaleId } });
    expect(line?.preorderReleasedAt).toBeInstanceOf(Date);

    const presale = await testPrisma.productPresale.findUnique({ where: { id: presaleId } });
    expect(presale).toMatchObject({ status: "RELEASED", releasedBy: "user-paula" });
  });

  it("el pedido ya se puede despachar", async () => {
    const order = await testPrisma.order.findUnique({
      where: { id: mixedOrderId },
      select: { orderItems: { select: { isPreorder: true, preorderReleasedAt: true } } },
    });
    expect(isOrderHeldByPresale(order!)).toBe(false);

    const dispatchable = await testPrisma.order.count({
      where: { storeId, status: "PAID", ...ORDER_READY_TO_DISPATCH },
    });
    expect(dispatchable).toBe(1);
  });
});
