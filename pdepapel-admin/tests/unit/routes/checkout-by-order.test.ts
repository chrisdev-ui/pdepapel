import { OrderStatus, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(),
  updatePayment: vi.fn(),
  generateWompiPayment: vi.fn(),
  validateStockAvailability: vi.fn(),
  sendOrderEmail: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findUnique: mocks.findOrder },
    paymentDetails: { update: mocks.updatePayment },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  generateWompiPayment: mocks.generateWompiPayment,
  processOrderItemsInBatches: vi.fn(),
}));
vi.mock("@/lib/inventory", () => ({
  validateStockAvailability: mocks.validateStockAvailability,
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
vi.mock("@/constants", () => ({ BATCH_SIZE: 50 }));

import { POST } from "@/app/api/[storeId]/checkout/[orderId]/route";

const baseOrder = {
  id: "order-1",
  orderNumber: "ORD-1",
  status: OrderStatus.CREATED,
  orderItems: [{ productId: "p1", quantity: 1, product: { id: "p1" } }],
  shipping: null,
  coupon: null,
};

const call = () =>
  POST(new Request("https://admin.test/api/store/checkout/order-1", { method: "POST" }), {
    params: { storeId: "store", orderId: "order-1" },
  });

describe("POST /checkout/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateWompiPayment.mockResolvedValue("https://checkout.wompi.co/p/x");
    mocks.validateStockAvailability.mockResolvedValue(undefined);
  });

  it("cambia un pedido Bold sin pagar a Wompi y devuelve el enlace", async () => {
    mocks.findOrder.mockResolvedValue({
      ...baseOrder,
      payment: { id: "pay-1", method: PaymentMethod.Bold },
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.wompi.co/p/x" });
    expect(mocks.updatePayment).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { method: PaymentMethod.Wompi },
    });
  });

  it("no toca el método cuando el pedido ya es Wompi", async () => {
    mocks.findOrder.mockResolvedValue({
      ...baseOrder,
      payment: { id: "pay-1", method: PaymentMethod.Wompi },
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(mocks.updatePayment).not.toHaveBeenCalled();
  });

  it("rechaza pedidos de transferencia o contra entrega", async () => {
    mocks.findOrder.mockResolvedValue({
      ...baseOrder,
      payment: { id: "pay-1", method: PaymentMethod.BankTransfer },
    });

    const response = await call();

    expect(response.status).toBe(400);
    expect(mocks.updatePayment).not.toHaveBeenCalled();
    expect(mocks.generateWompiPayment).not.toHaveBeenCalled();
  });

  it("rechaza pedidos ya pagados", async () => {
    mocks.findOrder.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.PAID,
      payment: { id: "pay-1", method: PaymentMethod.Bold },
    });

    const response = await call();

    expect(response.status).toBe(409);
    expect(mocks.updatePayment).not.toHaveBeenCalled();
  });
});
