import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { CouponState } from "@/app/(routes)/finalizar-compra/components/multi-step-checkout-form";
import { CheckoutFormValue } from "@/app/(routes)/finalizar-compra/components/multi-step-checkout-form";
import { joinFullName } from "@/lib/checkout-steps";
import { ShippingQuoteResponse } from "@/types";

/**
 * An order that was created for online payment but not paid yet. The cart is
 * kept until the gateway confirms, so returning to the checkout must offer
 * «Pagar ahora» instead of silently creating a duplicate.
 */
export interface PendingCheckoutOrder {
  id: string;
  orderNumber: string;
  total: number;
  createdAt: number;
}

/** Pending orders older than this are ignored (the admin expires them too). */
export const PENDING_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Form data saved longer ago than this is dropped on the next visit. */
export const CHECKOUT_FORM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const CHECKOUT_STORAGE_VERSION = 2;

interface CheckoutStore {
  currentStep: number;
  formData: Partial<CheckoutFormValue>;
  couponState: CouponState;
  quoteData: ShippingQuoteResponse | null;
  /** Identity of the request that produced `quoteData`. */
  quoteKey: string | null;
  quoteFetchedAt: number | null;
  pendingOrder: PendingCheckoutOrder | null;
  updatedAt: number | null;
  setCurrentStep: (step: number) => void;
  setFormData: (data: Partial<CheckoutFormValue>) => void;
  setCouponState: (state: CouponState) => void;
  setQuoteData: (
    data: ShippingQuoteResponse | null,
    key?: string | null,
  ) => void;
  setPendingOrder: (order: PendingCheckoutOrder | null) => void;
  resetCheckout: () => void;
}

const initialState = {
  currentStep: 1,
  formData: {},
  couponState: {
    coupon: null,
    isValid: null,
  },
  quoteData: null,
  quoteKey: null,
  quoteFetchedAt: null,
  pendingOrder: null,
  updatedAt: null,
};

type PersistedCheckoutState = Partial<
  Omit<
    CheckoutStore,
    | "setCurrentStep"
    | "setFormData"
    | "setCouponState"
    | "setQuoteData"
    | "setPendingOrder"
    | "resetCheckout"
  >
> & {
  formData?: Partial<CheckoutFormValue> & {
    firstName?: string;
    lastName?: string;
  };
};

/**
 * Brings older `checkout-storage` payloads to the current shape: the first
 * and last name become one field, the old four-step index is clamped, and
 * quotes are dropped because their age is unknown.
 */
export function migrateCheckoutStorage(
  persisted: unknown,
  version: number,
  now = Date.now(),
): PersistedCheckoutState {
  const state = (persisted ?? {}) as PersistedCheckoutState;
  if (version >= CHECKOUT_STORAGE_VERSION) return state;

  const { firstName, lastName, ...restFormData } = state.formData ?? {};
  const fullName =
    restFormData.fullName?.trim() || joinFullName(firstName, lastName);

  return {
    ...state,
    formData: {
      ...restFormData,
      ...(fullName ? { fullName } : {}),
    },
    currentStep: Math.min(Math.max(state.currentStep ?? 1, 1), 3),
    quoteData: null,
    quoteKey: null,
    quoteFetchedAt: null,
    pendingOrder: state.pendingOrder ?? null,
    updatedAt: state.updatedAt ?? now,
  };
}

/** Drops data left from a much older visit; the cart itself is kept. */
export function expireCheckoutStorage(
  state: PersistedCheckoutState,
  now = Date.now(),
): PersistedCheckoutState {
  if (!state.updatedAt || now - state.updatedAt < CHECKOUT_FORM_MAX_AGE_MS) {
    return state;
  }
  return {
    ...initialState,
    pendingOrder: state.pendingOrder ?? null,
    updatedAt: now,
  };
}

export const useCheckoutStore = create(
  persist<CheckoutStore>(
    (set) => ({
      ...initialState,
      setCurrentStep: (step) => set({ currentStep: step, updatedAt: Date.now() }),
      setFormData: (data) =>
        set((state) => ({
          formData: { ...state.formData, ...data },
          updatedAt: Date.now(),
        })),
      setCouponState: (state) =>
        set({ couponState: state, updatedAt: Date.now() }),
      setQuoteData: (data, key = null) =>
        set({
          quoteData: data,
          quoteKey: data ? key : null,
          quoteFetchedAt: data ? Date.now() : null,
          updatedAt: Date.now(),
        }),
      setPendingOrder: (order) => set({ pendingOrder: order }),
      resetCheckout: () => set({ ...initialState, updatedAt: Date.now() }),
    }),
    {
      name: "checkout-storage",
      version: CHECKOUT_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) =>
        expireCheckoutStorage(
          migrateCheckoutStorage(persisted, version),
        ) as CheckoutStore,
      merge: (persisted, current) => ({
        ...current,
        ...expireCheckoutStorage((persisted ?? {}) as PersistedCheckoutState),
      }),
    },
  ),
);

export function isPendingOrderUsable(
  order: PendingCheckoutOrder | null | undefined,
  now = Date.now(),
): order is PendingCheckoutOrder {
  return Boolean(order && now - order.createdAt < PENDING_ORDER_MAX_AGE_MS);
}
