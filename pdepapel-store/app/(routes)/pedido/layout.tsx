import type { Metadata } from "next";

import { ORDER_RECEIPT_REFERRER_POLICY } from "@/lib/receipt-headers.mjs";

/**
 * La meta `referrer` de la raíz (`origin-when-cross-origin`) le gana a la
 * cabecera `Referrer-Policy`; el recibo, su 404 y su error llevan la suya.
 */
export const metadata: Metadata = {
  referrer: ORDER_RECEIPT_REFERRER_POLICY,
};

export default function OrderReceiptLayout({ children }: { children: React.ReactNode }) {
  return children;
}
