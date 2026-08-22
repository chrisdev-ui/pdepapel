import { OrderStatus } from "@/constants";

export const ORDER_STATUS_POLL_INTERVAL_MS = 10_000;

export function shouldPollOrderStatus(status: string, isVisible: boolean) {
  return (
    isVisible &&
    (status === OrderStatus.CREATED || status === OrderStatus.PENDING)
  );
}
