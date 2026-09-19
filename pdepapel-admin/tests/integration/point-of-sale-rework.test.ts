import { InventoryMovementType, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  verifySignature: vi.fn(() => true),
  sendOrderEmail: vi.fn(),
}));

// Bold real no entra en las pruebas: la firma del webhook y el envío al datáfono se simulan.
vi.mock("@/lib/bold", () => ({ getBoldWebhookSecretKey: () => "secret", verifyBoldWebhookSignature: mocks.verifySignature }));
vi.mock("@/lib/bold-terminal", () => ({ pushToBoldDatafono: mocks.push }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn() }));
vi.mock("@/lib/google-analytics", () => ({ recordPaidOrderInGoogleAnalytics: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));

import { POST as boldWebhook } from "@/app/api/webhook/bold/route";
import { recalculateKitStock } from "@/lib/inventory";
import { chargePointOfSaleOnTerminal, createPointOfSaleSale, undoPointOfSaleSale } from "@/lib/point-of-sale";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const KEY = (name: string) => `pos-rework-${name}-${Date.now()}`;

function boldApproved(orderNumber: string, total: number, paymentId = "BOLD-TEST-1") {
  return new Request("https://admin.example.com/api/webhook/bold", {
    method: "POST",
    headers: { "content-type": "application/json", "x-bold-signature": "firma" },
    body: JSON.stringify({ type: "SALE_APPROVED", data: { reference: orderNumber, payment_id: paymentId, amount: { total, currency: "COP" } } }),
  });
}

/**
 * Vender: ventas reales sobre la base de pruebas. Una por comportamiento:
 * transferencia con referencia, oferta vigente (precio rebajado al pedido y
 * al recibo; costo real al kardex), kit, datáfono Bold de punta a punta con
 * el webhook, y «Deshacer» dentro y fuera de los 30 minutos.
 */
describe("point of sale rework with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.verifySignature.mockReturnValue(true);
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
  });

  afterEach(async () => {
    if (fixture) {
      await testPrisma.paymentWebhookEvent.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.offer.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("requires a transfer reference and stores it on the payment", async () => {
    const base = { storeId: fixture!.store.id, items: [{ productId: fixture!.component.id, quantity: 1 }], paymentMethod: PaymentMethod.BankTransfer, userId: fixture!.store.userId };
    await expect(createPointOfSaleSale({ ...base, idempotencyKey: KEY("ref-missing") })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("referencia de la transferencia") });
    await expect(createPointOfSaleSale({ ...base, idempotencyKey: KEY("ref-short"), transactionId: " 12 " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(testPrisma.order.count({ where: { storeId: fixture!.store.id } })).resolves.toBe(0);

    const sale = await createPointOfSaleSale({ ...base, idempotencyKey: KEY("ref-ok"), transactionId: " NEQUI-778 " });
    expect(sale).toMatchObject({ duplicate: false, pending: false, order: { status: OrderStatus.PAID, payment: { method: PaymentMethod.BankTransfer, transactionId: "NEQUI-778" } } });
    expect(sale.order.paidAt).toBeInstanceOf(Date);
  });

  it("charges the live online offer, records the discounted price on the order and keeps the real cost in the kardex", async () => {
    await testPrisma.offer.create({
      data: {
        storeId: fixture!.store.id,
        name: "Semana rosa",
        label: "20% OFF",
        type: "PERCENTAGE",
        amount: 20,
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 3_600_000),
        products: { create: [{ productId: fixture!.component.id }] },
      },
    });

    const sale = await createPointOfSaleSale({
      storeId: fixture!.store.id,
      items: [{ productId: fixture!.component.id, quantity: 2 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: KEY("offer"),
      userId: fixture!.store.userId,
    });

    expect(sale.order).toMatchObject({ status: OrderStatus.PAID, subtotal: 16000, total: 16000, totalProductCost: 8000, netProfit: 8000 });
    expect(sale.order.adminNotes).toContain("ofertas aplicadas: $ 4.000");
    expect(sale.order.orderItems).toEqual([expect.objectContaining({ productId: fixture!.component.id, quantity: 2, price: 8000 })]);
    await expect(testPrisma.inventoryMovement.findMany({ where: { referenceId: sale.order.id } })).resolves.toEqual([
      expect.objectContaining({ type: InventoryMovementType.IN_PERSON_SALE, quantity: -2, previousStock: 6, newStock: 4, cost: 4000, price: 10000 }),
    ]);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 4, price: 10000 });
  });

  it("undoes a kit sale inside 30 minutes: order cancelled, components back, kit stock recalculated", async () => {
    const sale = await createPointOfSaleSale({
      storeId: fixture!.store.id,
      items: [{ productId: fixture!.kit.id, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: KEY("kit-undo"),
      userId: fixture!.store.userId,
    });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 4 });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.kit.id } })).resolves.toMatchObject({ stock: 2 });

    const undo = await undoPointOfSaleSale({ storeId: fixture!.store.id, orderId: sale.order.id, userId: fixture!.store.userId, now: new Date(sale.order.paidAt!.getTime() + 10 * 60_000) });
    expect(undo).toMatchObject({ restocked: true, order: { status: OrderStatus.CANCELLED } });
    expect(undo.order.adminNotes).toContain("deshecha desde el punto de venta");
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 6 });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.kit.id } })).resolves.toMatchObject({ stock: 3 });
    const movements = await testPrisma.inventoryMovement.findMany({ where: { referenceId: sale.order.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((movement) => [movement.productId, movement.type, movement.quantity])).toEqual([
      [fixture!.component.id, InventoryMovementType.IN_PERSON_SALE, -2],
      [fixture!.component.id, InventoryMovementType.ORDER_CANCELLED, 2],
    ]);
    expect(movements[1].reason).toContain(`Venta presencial deshecha #${sale.order.orderNumber}`);

    await expect(undoPointOfSaleSale({ storeId: fixture!.store.id, orderId: sale.order.id, userId: fixture!.store.userId })).rejects.toMatchObject({ statusCode: 409, message: `La venta ${sale.order.orderNumber} ya estaba deshecha.` });
  });

  it("refuses to undo after 30 minutes and leaves everything untouched", async () => {
    const sale = await createPointOfSaleSale({
      storeId: fixture!.store.id,
      items: [{ productId: fixture!.component.id, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: KEY("late-undo"),
      userId: fixture!.store.userId,
    });
    await expect(
      undoPointOfSaleSale({ storeId: fixture!.store.id, orderId: sale.order.id, userId: fixture!.store.userId, now: new Date(sale.order.paidAt!.getTime() + 31 * 60_000) }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("Pasaron más de 30 minutos") });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: sale.order.id } })).resolves.toMatchObject({ status: OrderStatus.PAID });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 5 });
    await expect(testPrisma.inventoryMovement.count({ where: { referenceId: sale.order.id } })).resolves.toBe(1);
  });

  it("sells on the Bold card terminal end to end: pending order, push, webhook marks paid and deducts once, then undo restocks", async () => {
    mocks.push.mockResolvedValue({ success: true, message: "Cobro enviado al datáfono" });
    const sale = await createPointOfSaleSale({
      storeId: fixture!.store.id,
      items: [{ productId: fixture!.component.id, quantity: 1 }],
      paymentMethod: PaymentMethod.Bold,
      idempotencyKey: KEY("bold"),
      userId: fixture!.store.userId,
    });
    expect(sale).toMatchObject({ pending: true, duplicate: false, order: { status: OrderStatus.PENDING, paidAt: null, type: OrderType.POINT_OF_SALE, total: 10000, payment: { method: PaymentMethod.Bold } } });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 6 });
    await expect(testPrisma.inventoryMovement.count({ where: { referenceId: sale.order.id } })).resolves.toBe(0);

    await expect(chargePointOfSaleOnTerminal({ storeId: fixture!.store.id, orderId: sale.order.id })).resolves.toEqual({ message: "Cobro enviado al datáfono" });
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000, orderNumber: sale.order.orderNumber, currency: "COP" }));

    const wrongAmount = await boldWebhook(boldApproved(sale.order.orderNumber, 9999));
    expect(wrongAmount.status).toBe(400);

    const approved = await boldWebhook(boldApproved(sale.order.orderNumber, 10000));
    expect(approved.status).toBe(200);
    const paid = await testPrisma.order.findUniqueOrThrow({ where: { id: sale.order.id }, include: { payment: true } });
    expect(paid).toMatchObject({ status: OrderStatus.PAID, payment: { transactionId: "BOLD-TEST-1" } });
    expect(paid.paidAt).toBeInstanceOf(Date);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 5 });
    await expect(testPrisma.inventoryMovement.findMany({ where: { referenceId: sale.order.id } })).resolves.toEqual([
      expect.objectContaining({ type: InventoryMovementType.ORDER_PLACED, quantity: -1, cost: 4000 }),
    ]);

    // Un reenvío del mismo webhook no descuenta dos veces.
    const replay = await boldWebhook(boldApproved(sale.order.orderNumber, 10000));
    expect(replay.status).toBe(200);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 5 });

    const undo = await undoPointOfSaleSale({ storeId: fixture!.store.id, orderId: sale.order.id, userId: fixture!.store.userId });
    expect(undo).toMatchObject({ restocked: true, order: { status: OrderStatus.CANCELLED } });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 6 });
  });

  it("cancels a pending terminal charge without inventory and ignores a late approval", async () => {
    const sale = await createPointOfSaleSale({
      storeId: fixture!.store.id,
      items: [{ productId: fixture!.component.id, quantity: 2 }],
      paymentMethod: PaymentMethod.Bold,
      idempotencyKey: KEY("bold-cancel"),
      userId: fixture!.store.userId,
    });
    const undo = await undoPointOfSaleSale({ storeId: fixture!.store.id, orderId: sale.order.id, userId: fixture!.store.userId });
    expect(undo).toMatchObject({ restocked: false, productIds: [], order: { status: OrderStatus.CANCELLED } });
    await expect(testPrisma.inventoryMovement.count({ where: { storeId: fixture!.store.id } })).resolves.toBe(0);

    const late = await boldWebhook(boldApproved(sale.order.orderNumber, 20000, "BOLD-LATE"));
    expect(late.status).toBe(200);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: sale.order.id } })).resolves.toMatchObject({ status: OrderStatus.CANCELLED, paidAt: null });
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } })).resolves.toMatchObject({ stock: 6 });
  });

  it("cancels the pending order when the terminal does not accept the charge", async () => {
    mocks.push.mockResolvedValue({ success: false, message: "Terminal sin conexión" });
    const sale = await createPointOfSaleSale({
      storeId: fixture!.store.id,
      items: [{ productId: fixture!.component.id, quantity: 1 }],
      paymentMethod: PaymentMethod.Bold,
      idempotencyKey: KEY("bold-fail"),
      userId: fixture!.store.userId,
    });
    await expect(chargePointOfSaleOnTerminal({ storeId: fixture!.store.id, orderId: sale.order.id })).rejects.toMatchObject({ statusCode: 400, message: "El datáfono no recibió el cobro: Terminal sin conexión" });
    const cancelled = await testPrisma.order.findUniqueOrThrow({ where: { id: sale.order.id } });
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(cancelled.adminNotes).toContain("el datáfono no recibió el cobro: Terminal sin conexión");
    await expect(chargePointOfSaleOnTerminal({ storeId: fixture!.store.id, orderId: sale.order.id })).rejects.toMatchObject({ statusCode: 409 });
  });
});
