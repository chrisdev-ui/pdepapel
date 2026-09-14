import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
  productFindMany: vi.fn(),
  imageFindMany: vi.fn(),
  orderCreate: vi.fn(),
  transaction: vi.fn(),
}));

// `lib/utils` (de donde sale el número de pedido) carga el esquema de entorno.
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    conversation: { findFirst: mocks.conversationFindFirst },
    product: { findMany: mocks.productFindMany },
    image: { findMany: mocks.imageFindMany },
    $transaction: mocks.transaction,
  },
}));

import { createOrderFromConversationCart } from "@/lib/whatsapp/cart-orders";

const CART = {
  order: {
    catalogId: "1049887011264361",
    note: "",
    items: [
      { sku: "AGE-CLS-AZU-XS-L-2868", quantity: 2, unitPrice: 13000, currency: "COP" },
      { sku: "STI-KAW-001", quantity: 1, unitPrice: 5000, currency: "COP" },
    ],
  },
};

const CATALOG = [
  { id: "p1", name: "Agenda Mini Azul aguamarina", sku: "AGE-CLS-AZU-XS-L-2868", price: 13000, stock: 5, isArchived: false },
  { id: "p2", name: "Sticker kawaii", sku: "STI-KAW-001", price: 5000, stock: 3, isArchived: false },
];

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-1",
    phone: "573024686403",
    contactName: "Laura",
    orderId: null,
    messages: [{ id: "m2", metadata: null }, { id: "m1", metadata: CART }],
    ...overrides,
  };
}

const input = { storeId: "store-1", conversationId: "conversation-1", createdBy: "user-owner" };

describe("createOrderFromConversationCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationFindFirst.mockResolvedValue(conversation());
    mocks.productFindMany.mockResolvedValue(CATALOG);
    mocks.imageFindMany.mockResolvedValue([
      { productId: "p1", url: "https://img/a.jpg" },
      { productId: "p1", url: "https://img/a2.jpg" },
    ]);
    mocks.orderCreate.mockResolvedValue({ id: "order-1" });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ order: { create: mocks.orderCreate }, conversation: { update: mocks.conversationUpdate } }),
    );
  });

  it("creates a DRAFT order from the cart, priced with today's catalog", async () => {
    await expect(createOrderFromConversationCart(input)).resolves.toMatchObject({
      orderId: "order-1",
      existing: false,
    });

    const data = mocks.orderCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      storeId: "store-1",
      type: "STANDARD",
      // Borrador: no exige dirección ni pago y no toca inventario.
      status: "DRAFT",
      source: "WHATSAPP",
      createdBy: "user-owner",
      fullName: "Laura",
      phone: "573024686403",
      subtotal: 2 * 13000 + 5000,
      total: 2 * 13000 + 5000,
    });
    expect(data.orderNumber).toMatch(/^ORD-\d+-\d+$/);
  });

  it("snapshots each line with the product name, sku, price and main image", async () => {
    await createOrderFromConversationCart(input);

    expect(mocks.orderCreate.mock.calls[0][0].data.orderItems.create).toEqual([
      {
        productId: "p1",
        quantity: 2,
        name: "Agenda Mini Azul aguamarina",
        sku: "AGE-CLS-AZU-XS-L-2868",
        price: 13000,
        imageUrl: "https://img/a.jpg",
      },
      {
        productId: "p2",
        quantity: 1,
        name: "Sticker kawaii",
        sku: "STI-KAW-001",
        price: 5000,
        // Sin imagen registrada: queda vacío en vez de romper.
        imageUrl: "",
      },
    ]);
  });

  it("links the conversation to the order it produced", async () => {
    await createOrderFromConversationCart(input);

    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { orderId: "order-1" },
    });
  });

  it("returns the existing order instead of creating a second one", async () => {
    mocks.conversationFindFirst.mockResolvedValue(conversation({ orderId: "order-existing" }));

    await expect(createOrderFromConversationCart(input)).resolves.toEqual({
      orderId: "order-existing",
      existing: true,
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("uses the newest cart when the chat has more than one", async () => {
    const older = { order: { catalogId: "c", note: "", items: [{ sku: "STI-KAW-001", quantity: 9 }] } };
    mocks.conversationFindFirst.mockResolvedValue(
      conversation({ messages: [{ id: "new", metadata: CART }, { id: "old", metadata: older }] }),
    );

    await createOrderFromConversationCart(input);

    expect(mocks.orderCreate.mock.calls[0][0].data.orderItems.create).toHaveLength(2);
  });

  it("skips lines whose SKU is gone but still builds the order", async () => {
    mocks.productFindMany.mockResolvedValue([CATALOG[0]]);

    await createOrderFromConversationCart(input);

    const items = mocks.orderCreate.mock.calls[0][0].data.orderItems.create;
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe("AGE-CLS-AZU-XS-L-2868");
    // El total solo cuenta lo que sigue existiendo.
    expect(mocks.orderCreate.mock.calls[0][0].data.total).toBe(26000);
  });

  it("refuses when the chat has no cart at all", async () => {
    mocks.conversationFindFirst.mockResolvedValue(
      conversation({ messages: [{ id: "m1", metadata: null }] }),
    );

    await expect(createOrderFromConversationCart(input)).rejects.toThrow();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("refuses when no product of the cart survives in the catalog", async () => {
    mocks.productFindMany.mockResolvedValue([]);

    await expect(createOrderFromConversationCart(input)).rejects.toThrow();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("refuses a conversation from another store", async () => {
    mocks.conversationFindFirst.mockResolvedValue(null);

    await expect(createOrderFromConversationCart(input)).rejects.toThrow();
    expect(mocks.conversationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conversation-1", storeId: "store-1" } }),
    );
  });

  it("falls back to a generic name when the contact has none", async () => {
    mocks.conversationFindFirst.mockResolvedValue(conversation({ contactName: null }));

    await createOrderFromConversationCart(input);

    expect(mocks.orderCreate.mock.calls[0][0].data.fullName).toBe("Clienta de WhatsApp");
  });
});
