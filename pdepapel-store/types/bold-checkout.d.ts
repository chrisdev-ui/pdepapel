import type { BoldCheckoutConfig } from "@/lib/bold";

declare global {
  interface Window {
    BoldCheckout?: new (payload: BoldCheckoutConfig) => {
      open: () => void;
    };
  }
}

export {};
