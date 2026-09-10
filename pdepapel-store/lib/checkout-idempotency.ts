/**
 * One key per order attempt. The same key is sent on every retry of the same
 * attempt (timeout, tap twice, network blip) so the API replays the order it
 * already created instead of creating a second one. A new key is issued once
 * an order was created or when the cart changes.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random()}-${random()}`;
}

/** Cart identity: product ids and quantities, order-insensitive. */
export function getCartSignature(
  items: { id: string; quantity?: number | null }[],
): string {
  return [...items]
    .map((item) => `${item.id}x${item.quantity ?? 1}`)
    .sort()
    .join(",");
}
