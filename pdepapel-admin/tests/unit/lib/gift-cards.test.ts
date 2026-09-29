import { GiftCardMovementType, GiftCardStatus, OrderType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GIFT_CARD_DENOMINATIONS,
  applyGiftCardMovement,
  assertSellableDenomination,
  getActiveDenominations,
  getAmountDue,
  issueGiftCardForOrder,
  isGiftCardUsable,
  parseDenominationAmount,
} from "@/lib/gift-cards";
import { parseGiftCardCode } from "@/lib/gift-card-codes";

/** Doble de transacción: lo justo para ver qué escribe el libro. */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "card-1", balance: 100000, status: GiftCardStatus.ACTIVE }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    giftCardMovement: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "mov-1", ...data })),
    },
    giftCard: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "card-new", deliveredAt: null, ...data })),
    },
    giftCardDenomination: { findMany: vi.fn().mockResolvedValue([]) },
    order: { findFirst: vi.fn() },
    ...overrides,
  };
}

const movement = (amount: number, extra: Record<string, unknown> = {}) => ({
  storeId: "store-1",
  giftCardId: "card-1",
  type: GiftCardMovementType.HELD,
  amount,
  orderId: "order-1",
  idempotencyKey: "hold:order-1",
  ...extra,
});

describe("getAmountDue", () => {
  it("is the total minus what the card covers, never negative, and total stays untouched", () => {
    expect(getAmountDue({ total: 85900, giftCardAmount: 50000 })).toBe(35900);
    expect(getAmountDue({ total: 85900 })).toBe(85900);
    expect(getAmountDue({ total: 85900, giftCardAmount: 85900 })).toBe(0);
    expect(getAmountDue({ total: 40000, giftCardAmount: 50000 })).toBe(0);
  });
});

describe("denominations", () => {
  it("offers the three defaults when nothing is configured, without writing", async () => {
    const tx = makeTx();
    await expect(getActiveDenominations(tx as never, "store-1")).resolves.toEqual([...DEFAULT_GIFT_CARD_DENOMINATIONS]);
    expect(tx.giftCardDenomination.findMany).toHaveBeenCalledTimes(1);
  });

  it("offers only the active configured values, in order", async () => {
    const tx = makeTx({
      giftCardDenomination: {
        findMany: vi.fn().mockResolvedValue([
          { amount: 30000, isActive: true },
          { amount: 50000, isActive: false },
          { amount: 150000, isActive: true },
        ]),
      },
    });
    await expect(getActiveDenominations(tx as never, "store-1")).resolves.toEqual([30000, 150000]);
    await expect(assertSellableDenomination(tx as never, "store-1", 50000)).rejects.toThrow("no está a la venta");
    await expect(assertSellableDenomination(tx as never, "store-1", 150000)).resolves.toBeUndefined();
  });

  it("parses an integer amount within bounds, accepting thousand separators", () => {
    expect(parseDenominationAmount("150.000")).toBe(150000);
    expect(parseDenominationAmount(50000)).toBe(50000);
    expect(() => parseDenominationAmount("5000")).toThrow("entre");
    expect(() => parseDenominationAmount("abc")).toThrow("entre");
    expect(() => parseDenominationAmount(3000000)).toThrow("entre");
  });
});

describe("applyGiftCardMovement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("locks the row, guards the balance in the UPDATE and records balanceAfter", async () => {
    const tx = makeTx();
    const result = await applyGiftCardMovement(tx as never, movement(-30000));

    expect(result.applied).toBe(true);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockSql = String(tx.$queryRaw.mock.calls[0][0].join("?"));
    expect(lockSql).toContain("FOR UPDATE");
    const updateSql = String(tx.$executeRaw.mock.calls[0][0].join("?"));
    expect(updateSql).toContain("`balance` + ? >= 0");
    expect(tx.giftCardMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "HELD", amount: -30000, balanceAfter: 70000, idempotencyKey: "hold:order-1" }),
    });
  });

  it("is a no-op when the same fact was already written", async () => {
    const tx = makeTx({
      giftCardMovement: { findUnique: vi.fn().mockResolvedValue({ id: "old" }), create: vi.fn() },
    });
    const result = await applyGiftCardMovement(tx as never, movement(-30000));
    expect(result.applied).toBe(false);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.giftCardMovement.create).not.toHaveBeenCalled();
  });

  it("refuses a hold beyond the balance before touching anything", async () => {
    const tx = makeTx();
    await expect(applyGiftCardMovement(tx as never, movement(-120000))).rejects.toThrow("no alcanza");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.giftCardMovement.create).not.toHaveBeenCalled();
  });

  it("refuses a voided card and a missing card", async () => {
    const voided = makeTx({ $queryRaw: vi.fn().mockResolvedValue([{ id: "card-1", balance: 5000, status: GiftCardStatus.VOID }]) });
    await expect(applyGiftCardMovement(voided as never, movement(-1000))).rejects.toThrow("anulada");
    const missing = makeTx({ $queryRaw: vi.fn().mockResolvedValue([]) });
    await expect(applyGiftCardMovement(missing as never, movement(-1000))).rejects.toThrow("no existe");
  });

  it("treats a guarded UPDATE that touched no row as a race and writes nothing", async () => {
    const tx = makeTx({ $executeRaw: vi.fn().mockResolvedValue(0) });
    await expect(applyGiftCardMovement(tx as never, movement(-30000))).rejects.toThrow("cambió mientras se usaba");
    expect(tx.giftCardMovement.create).not.toHaveBeenCalled();
  });

  it("writes markers (amount 0) without an UPDATE", async () => {
    const tx = makeTx();
    await applyGiftCardMovement(tx as never, movement(0, { type: GiftCardMovementType.REDEEMED, idempotencyKey: "redeem:order-1" }));
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.giftCardMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 0, balanceAfter: 100000 }) });
  });
});

describe("issueGiftCardForOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  const giftCardOrder = {
    id: "order-1",
    type: OrderType.GIFT_CARD,
    total: 100000,
    email: "luisa@example.com",
    giftRecipientName: "Mariana López",
    giftRecipientEmail: "Mariana@Example.com",
    giftMessage: "¡Feliz cumpleaños!",
  };

  it("ignores orders that are not a gift-card purchase", async () => {
    const tx = makeTx({ order: { findFirst: vi.fn().mockResolvedValue({ ...giftCardOrder, type: OrderType.STANDARD }) } });
    await expect(issueGiftCardForOrder(tx as never, { storeId: "store-1", orderId: "order-1" })).resolves.toBeNull();
    expect(tx.giftCard.create).not.toHaveBeenCalled();
  });

  it("creates the card with a hashed code, an ISSUED movement and the recipient as delivery target", async () => {
    const tx = makeTx({ order: { findFirst: vi.fn().mockResolvedValue(giftCardOrder) } });
    tx.$queryRaw.mockResolvedValue([{ id: "card-new", balance: 0, status: GiftCardStatus.ACTIVE }]);

    const issued = await issueGiftCardForOrder(tx as never, { storeId: "store-1", orderId: "order-1" });

    expect(issued?.code).toMatch(/^PDP-/);
    expect(issued?.deliverTo).toBe("mariana@example.com");
    const created = tx.giftCard.create.mock.calls[0][0].data;
    expect(created.codeHash).toBe(parseGiftCardCode(issued!.code!)!.hash);
    expect(created.codeLast4).toBe(parseGiftCardCode(issued!.code!)!.last4);
    expect(created).toMatchObject({ initialAmount: 100000, balance: 0, purchaseOrderId: "order-1", buyerEmail: "luisa@example.com", recipientName: "Mariana López" });
    expect(created).not.toHaveProperty("code");
    expect(tx.giftCardMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "ISSUED", amount: 100000, balanceAfter: 100000, idempotencyKey: "issue:order-1" }),
    });
  });

  it("falls back to the buyer's email when there is no recipient email", async () => {
    const tx = makeTx({ order: { findFirst: vi.fn().mockResolvedValue({ ...giftCardOrder, giftRecipientEmail: null }) } });
    tx.$queryRaw.mockResolvedValue([{ id: "card-new", balance: 0, status: GiftCardStatus.ACTIVE }]);
    const issued = await issueGiftCardForOrder(tx as never, { storeId: "store-1", orderId: "order-1" });
    expect(issued?.deliverTo).toBe("luisa@example.com");
  });

  it("issues once: a replayed webhook gets the existing card and no code", async () => {
    const tx = makeTx({
      order: { findFirst: vi.fn().mockResolvedValue(giftCardOrder) },
      giftCard: { findUnique: vi.fn().mockResolvedValue({ id: "card-1", codeLast4: "ABCD" }), create: vi.fn() },
    });
    const issued = await issueGiftCardForOrder(tx as never, { storeId: "store-1", orderId: "order-1" });
    expect(issued?.code).toBeNull();
    expect(issued?.card.id).toBe("card-1");
    expect(tx.giftCard.create).not.toHaveBeenCalled();
    expect(tx.giftCardMovement.create).not.toHaveBeenCalled();
  });
});

describe("isGiftCardUsable", () => {
  it("needs an active card with balance that has not expired", () => {
    expect(isGiftCardUsable({ status: GiftCardStatus.ACTIVE, balance: 1000, expiresAt: null })).toBe(true);
    expect(isGiftCardUsable({ status: GiftCardStatus.VOID, balance: 1000, expiresAt: null })).toBe(false);
    expect(isGiftCardUsable({ status: GiftCardStatus.ACTIVE, balance: 0, expiresAt: null })).toBe(false);
    expect(isGiftCardUsable({ status: GiftCardStatus.ACTIVE, balance: 1000, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
  });
});
