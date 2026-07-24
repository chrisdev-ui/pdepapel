import { PaymentMethod } from "@/constants";

export interface GatewayRoutingConfig {
  primaryOnlineGateway: PaymentMethod;
  secondaryOnlineGateway: PaymentMethod;
  defaultOfflineMethod: PaymentMethod;
  enableFallbackRouting: boolean;
}

/**
 * Default Smart Gateway Routing Configuration
 * - Default pre-selected method: BankTransfer (Direct Bank / Bre-B)
 * - Primary Online Gateway: Bold (Cards, PSE, Nequi, Datáfono)
 * - Fallback Online Gateway: Wompi
 */
export const DEFAULT_PAYMENT_ROUTING: GatewayRoutingConfig = {
  primaryOnlineGateway: PaymentMethod.Bold,
  secondaryOnlineGateway: PaymentMethod.Wompi,
  defaultOfflineMethod: PaymentMethod.BankTransfer,
  enableFallbackRouting: true,
};

/**
 * Resolves gateway routing for a customer checkout session.
 */
export function resolvePaymentGateway(requestedMethod?: PaymentMethod): {
  activeMethod: PaymentMethod;
  isOnline: boolean;
  fallbackMethod?: PaymentMethod;
} {
  const method = requestedMethod || DEFAULT_PAYMENT_ROUTING.defaultOfflineMethod;

  if (method === PaymentMethod.Bold) {
    return {
      activeMethod: PaymentMethod.Bold,
      isOnline: true,
      fallbackMethod: PaymentMethod.Wompi,
    };
  }

  if (method === PaymentMethod.Wompi) {
    return {
      activeMethod: PaymentMethod.Wompi,
      isOnline: true,
      fallbackMethod: PaymentMethod.Bold,
    };
  }

  return {
    activeMethod: method,
    isOnline: false,
  };
}
