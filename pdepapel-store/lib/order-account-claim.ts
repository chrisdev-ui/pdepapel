import { orderPath } from "@/lib/routes";

const ORDER_ACCOUNT_CLAIM_KEY_PREFIX = "pdepapel:order-account-claim";

export const getOrderAccountClaimStorageKey = (orderId: string): string =>
  `${ORDER_ACCOUNT_CLAIM_KEY_PREFIX}:${orderId}`;

export const getOrderAccountClaimRedirectPath = (orderId: string): string =>
  orderPath(orderId);
