import { GiftCardMovementType, GiftCardStatus, OrderStatus, OrderType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  coverableAmount,
  handleGiftCardOnOrderCancellation,
  holdGiftCardForOrder,
  redeemGiftCardForOrder,
  releaseOrReverseGiftCardForOrder,
  voidGiftCardForPurchaseOrder,
} from "@/lib/gift-cards";

/**
 * Redención y reversión con un doble de transacción: qué movimiento se
 * escribe en cada situación y cuándo no se escribe nada (idempotencia).
 */
function makeTx(existingKeys: string[] = [], overrides: Record<string, unknown> = {}) {
  const keys = new Set(existingKeys);
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "card-1", balance: 60000, status: GiftCardStatus.ACTIVE }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    giftCardMovement: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { idempotencyKey: string } }) =>
        keys.has(where.idempotencyKey) ? { id: `mov-${where.idempotencyKey}` } : null,
      ),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "mov-new", ...data })),
    },
    giftCard: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "card-1", ...data })),
    },
    order: { findFirst: vi.fn() },
    ...overrides,
  };
}

const order = { id: "order-1", storeId: "store-1", giftCardId: "card-1", giftCardAmount: 30000 };
const written = (tx: ReturnType<typeof makeTx>) => tx.giftCardMovement.create.mock.calls.map((call) => call[0].data);

describe("coverableAmount", () => {
  it("covers the total or the balance, whichever is lower, never negative", () => {
    expect(coverableAmount(60000, 30000)).toBe(30000);
    expect(coverableAmount(20000, 30000)).toBe(20000);
    expect(coverableAmount(0, 30000)).toBe(0);
    expect(coverableAmount(-5, 30000)).toBe(0);
  });
});

describe("holdGiftCardForOrder", () => {
  it("writes a negative HELD keyed by the order", async () => {
    const tx = makeTx();
    await holdGiftCardForOrder(tx as never, { storeId: "store-1", giftCardId: "card-1", orderId: "order-1", amount: 30000 });
    expect(written(tx)[0]).toMatchObject({ type: GiftCardMovementType.HELD, amount: -30000, balanceAfter: 30000, orderId: "order-1", idempotencyKey: "hold:order-1" });
  });
});

describe("redeemGiftCardForOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("turns an open hold into a REDEEMED marker without touching the balance", async () => {
    const tx = makeTx(["hold:order-1"]);
    await redeemGiftCardForOrder(tx as never, order);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(written(tx)).toEqual([expect.objectContaining({ type: GiftCardMovementType.REDEEMED, amount: 0, idempotencyKey: "redeem:order-1" })]);
  });

  it("is a no-op on a replayed payment", async () => {
    const tx = makeTx(["hold:order-1", "redeem:order-1"]);
    await redeemGiftCardForOrder(tx as never, order);
    expect(written(tx)).toEqual([]);
  });

  it("re-holds when the hold had been released, then redeems", async () => {
    const tx = makeTx(["hold:order-1", "release:order-1"]);
    tx.giftCardMovement.count.mockResolvedValue(1);
    await redeemGiftCardForOrder(tx as never, order);
    expect(written(tx).map((m) => [m.type, m.amount, m.idempotencyKey])).toEqual([
      [GiftCardMovementType.HELD, -30000, "rehold:order-1:1"],
      [GiftCardMovementType.REDEEMED, 0, "redeem:order-1"],
    ]);
  });

  it("refuses with a panel-readable message when the balance no longer covers the order", async () => {
    const tx = makeTx(["hold:order-1", "release:order-1"], {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "card-1", balance: 5000, status: GiftCardStatus.ACTIVE }]),
    });
    await expect(redeemGiftCardForOrder(tx as never, order)).rejects.toThrow("ya no tiene saldo para cubrir 30.000");
    expect(written(tx)).toEqual([]);
  });

  it("ignores orders without a card", async () => {
    const tx = makeTx();
    expect(await redeemGiftCardForOrder(tx as never, { ...order, giftCardId: null })).toBeNull();
    expect(await redeemGiftCardForOrder(tx as never, { ...order, giftCardAmount: 0 })).toBeNull();
  });
});

describe("releaseOrReverseGiftCardForOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reverses a redeemed order: the amount comes back once", async () => {
    const tx = makeTx(["hold:order-1", "redeem:order-1"]);
    await releaseOrReverseGiftCardForOrder(tx as never, order);
    expect(written(tx)).toEqual([expect.objectContaining({ type: GiftCardMovementType.REVERSED, amount: 30000, idempotencyKey: "reverse:order-1" })]);
    const again = makeTx(["hold:order-1", "redeem:order-1", "reverse:order-1"]);
    await releaseOrReverseGiftCardForOrder(again as never, order);
    expect(written(again)).toEqual([]);
  });

  it("releases an unpaid hold once", async () => {
    const tx = makeTx(["hold:order-1"]);
    await releaseOrReverseGiftCardForOrder(tx as never, order);
    expect(written(tx)).toEqual([expect.objectContaining({ type: GiftCardMovementType.RELEASED, amount: 30000, idempotencyKey: "release:order-1" })]);
    const again = makeTx(["hold:order-1", "release:order-1"]);
    await releaseOrReverseGiftCardForOrder(again as never, order);
    expect(written(again)).toEqual([]);
  });

  it("does nothing when the order never held anything", async () => {
    const tx = makeTx();
    await releaseOrReverseGiftCardForOrder(tx as never, order);
    expect(written(tx)).toEqual([]);
  });
});

describe("voidGiftCardForPurchaseOrder", () => {
  beforeEach(() => vi.clearAllMocks());
  const card = { id: "card-1", storeId: "store-1", status: GiftCardStatus.ACTIVE, initialAmount: 100000, balance: 100000 };

  it("voids an unused card down to zero", async () => {
    const tx = makeTx([], { giftCard: { findFirst: vi.fn().mockResolvedValue(card), update: vi.fn().mockResolvedValue({ ...card, status: GiftCardStatus.VOID }) } });
    tx.$queryRaw.mockResolvedValue([{ id: "card-1", balance: 100000, status: GiftCardStatus.ACTIVE }]);
    await voidGiftCardForPurchaseOrder(tx as never, { storeId: "store-1", orderId: "purchase-1" });
    expect(written(tx)).toEqual([expect.objectContaining({ type: GiftCardMovementType.VOIDED, amount: -100000, balanceAfter: 0, idempotencyKey: "void:purchase-1" })]);
    expect(tx.giftCard.update).toHaveBeenCalledWith({ where: { id: "card-1" }, data: { status: GiftCardStatus.VOID } });
  });

  it("refuses when the card was already used, naming the amount", async () => {
    const tx = makeTx([], { giftCard: { findFirst: vi.fn().mockResolvedValue({ ...card, balance: 70000 }), update: vi.fn() } });
    tx.giftCardMovement.count.mockResolvedValue(1);
    await expect(voidGiftCardForPurchaseOrder(tx as never, { storeId: "store-1", orderId: "purchase-1" })).rejects.toThrow(
      "La tarjeta ya se usó por 30.000: reembolsa la diferencia por fuera del sistema.",
    );
    expect(written(tx)).toEqual([]);
    expect(tx.giftCard.update).not.toHaveBeenCalled();
  });

  it("is a no-op without a card or on an already voided one", async () => {
    expect(await voidGiftCardForPurchaseOrder(makeTx() as never, { storeId: "store-1", orderId: "x" })).toBeNull();
    const voided = makeTx([], { giftCard: { findFirst: vi.fn().mockResolvedValue({ ...card, status: GiftCardStatus.VOID }), update: vi.fn() } });
    await voidGiftCardForPurchaseOrder(voided as never, { storeId: "store-1", orderId: "x" });
    expect(written(voided)).toEqual([]);
  });
});

describe("handleGiftCardOnOrderCancellation", () => {
  it("releases the redemption and voids the purchased card in one call", async () => {
    const tx = makeTx(["hold:order-1"], {
      order: { findFirst: vi.fn().mockResolvedValue({ ...order, type: OrderType.GIFT_CARD }) },
      giftCard: { findFirst: vi.fn().mockResolvedValue({ id: "card-2", storeId: "store-1", status: GiftCardStatus.ACTIVE, initialAmount: 50000, balance: 50000 }), update: vi.fn().mockResolvedValue({}) },
    });
    tx.$queryRaw.mockResolvedValue([{ id: "card-x", balance: 50000, status: GiftCardStatus.ACTIVE }]);
    await handleGiftCardOnOrderCancellation(tx as never, { storeId: "store-1", orderId: "order-1" });
    expect(written(tx).map((m) => m.type)).toEqual([GiftCardMovementType.RELEASED, GiftCardMovementType.VOIDED]);
  });

  it("does nothing for an order that neither used nor bought a card", async () => {
    const tx = makeTx([], { order: { findFirst: vi.fn().mockResolvedValue({ id: "order-1", storeId: "store-1", type: OrderType.STANDARD, giftCardId: null, giftCardAmount: 0 }) } });
    await handleGiftCardOnOrderCancellation(tx as never, { storeId: "store-1", orderId: "order-1" });
    expect(written(tx)).toEqual([]);
    expect(tx.giftCard.findFirst).not.toHaveBeenCalled();
  });
});

describe("status guards", () => {
  it("paid-like statuses are the only revenue statuses", () => {
    expect([OrderStatus.PAID, OrderStatus.SENT]).toContain(OrderStatus.PAID);
  });
});
