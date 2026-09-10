import { describe, expect, it } from "vitest";

import {
  CHECKOUT_FORM_MAX_AGE_MS,
  expireCheckoutStorage,
  isPendingOrderUsable,
  migrateCheckoutStorage,
  PENDING_ORDER_MAX_AGE_MS,
} from "@/hooks/use-checkout-store";

describe("migrateCheckoutStorage", () => {
  it("une nombre y apellidos guardados en un solo campo", () => {
    const migrated = migrateCheckoutStorage(
      {
        currentStep: 4,
        formData: { firstName: "Paula", lastName: "Restrepo", email: "p@x.co" },
        quoteData: { quotes: [] },
      },
      0,
      123,
    );

    expect(migrated.formData).toEqual({ fullName: "Paula Restrepo", email: "p@x.co" });
    expect(migrated.currentStep).toBe(3);
    expect(migrated.quoteData).toBeNull();
    expect(migrated.updatedAt).toBe(123);
  });

  it("respeta un fullName ya presente y datos sin nombre", () => {
    expect(
      migrateCheckoutStorage({ formData: { fullName: "Ana", firstName: "X" } }, 1).formData,
    ).toEqual({ fullName: "Ana" });
    expect(migrateCheckoutStorage({ formData: { email: "a@b.co" } }, 0).formData).toEqual({
      email: "a@b.co",
    });
  });

  it("no toca un estado ya en la versión actual", () => {
    const state = { formData: { fullName: "Ana" }, currentStep: 2 };
    expect(migrateCheckoutStorage(state, 2)).toBe(state);
  });
});

describe("expireCheckoutStorage", () => {
  it("conserva datos recientes y limpia los viejos manteniendo el pedido pendiente", () => {
    const now = 10_000_000_000;
    const pendingOrder = { id: "o1", orderNumber: "ORD-1", total: 1, createdAt: now };
    const fresh = { formData: { fullName: "Ana" }, updatedAt: now - 1000, pendingOrder };
    expect(expireCheckoutStorage(fresh, now)).toBe(fresh);

    const stale = expireCheckoutStorage(
      { ...fresh, updatedAt: now - CHECKOUT_FORM_MAX_AGE_MS - 1 },
      now,
    );
    expect(stale.formData).toEqual({});
    expect(stale.pendingOrder).toEqual(pendingOrder);
  });

  it("no expira un estado sin fecha (semillas antiguas o pruebas)", () => {
    const state = { formData: { telephone: "3001234567" } };
    expect(expireCheckoutStorage(state)).toBe(state);
  });
});

describe("isPendingOrderUsable", () => {
  it("acepta pedidos recientes y rechaza los vencidos", () => {
    const now = 5_000_000_000;
    const order = { id: "o", orderNumber: "n", total: 1, createdAt: now - 60_000 };
    expect(isPendingOrderUsable(order, now)).toBe(true);
    expect(
      isPendingOrderUsable({ ...order, createdAt: now - PENDING_ORDER_MAX_AGE_MS - 1 }, now),
    ).toBe(false);
    expect(isPendingOrderUsable(null, now)).toBe(false);
  });
});
