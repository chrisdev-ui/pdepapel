import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { CouponState } from "@/app/(routes)/checkout/components/multi-step-checkout-form";
import { CheckoutFormValue } from "@/app/(routes)/checkout/components/multi-step-checkout-form";
import { ShippingQuoteResponse } from "@/types";

interface CheckoutStore {
  currentStep: number;
  formData: Partial<CheckoutFormValue>;
  couponState: CouponState;
  quoteData: ShippingQuoteResponse | null;
  setCurrentStep: (step: number) => void;
  setFormData: (data: Partial<CheckoutFormValue>) => void;
  setCouponState: (state: CouponState) => void;
  setQuoteData: (data: ShippingQuoteResponse | null) => void;
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
};

export const useCheckoutStore = create(
  persist<CheckoutStore>(
    (set) => ({
      ...initialState,
      setCurrentStep: (step) => set({ currentStep: step }),
      setFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),
      setCouponState: (state) => set({ couponState: state }),
      setQuoteData: (data) => set({ quoteData: data }),
      resetCheckout: () => set(initialState),
    }),
    {
      name: "checkout-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
