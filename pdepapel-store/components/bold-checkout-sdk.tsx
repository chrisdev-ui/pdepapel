"use client";

import Script from "next/script";

interface BoldCheckoutSdkProps {
  onReady?: () => void;
  onError?: () => void;
}

export function BoldCheckoutSdk({ onReady, onError }: BoldCheckoutSdkProps) {
  return (
    <Script
      id="bold-checkout-sdk"
      src="https://checkout.bold.co/library/boldPaymentButton.js"
      strategy="afterInteractive"
      onReady={onReady}
      onError={onError}
    />
  );
}
