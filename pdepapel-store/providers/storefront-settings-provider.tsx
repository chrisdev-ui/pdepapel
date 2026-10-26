"use client";

import { createContext, ReactNode, useContext } from "react";

import { EMPTY_BANK_TRANSFER } from "@/lib/bank-transfer";
import type { BankTransferInfo } from "@/types";

export interface StorefrontSettingsValue {
  freeShippingThreshold: number | null;
  /** Cuánto tarda en llegar un pedido; null si la dueña no lo ha configurado. */
  deliveryEstimate: string | null;
  /** Cuenta, llave Bre-B y WhatsApp para pagar por transferencia. */
  bankTransfer: BankTransferInfo;
}

const StorefrontSettingsContext = createContext<StorefrontSettingsValue>({
  freeShippingThreshold: null,
  deliveryEstimate: null,
  bankTransfer: EMPTY_BANK_TRANSFER,
});

/** Ajustes públicos de la tienda leídos en el servidor y compartidos con los componentes de cliente. */
export function StorefrontSettingsProvider({
  value,
  children,
}: {
  value: StorefrontSettingsValue;
  children: ReactNode;
}) {
  return (
    <StorefrontSettingsContext.Provider value={value}>
      {children}
    </StorefrontSettingsContext.Provider>
  );
}

export function useStorefrontSettings() {
  return useContext(StorefrontSettingsContext);
}
