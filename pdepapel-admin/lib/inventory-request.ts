export type InventoryAction = "add" | "subtract";

const decrementTypes = new Set(["DAMAGE", "LOST", "STORE_USE", "PROMOTION"]);

const incrementTypes = new Set(["RETURN", "PURCHASE", "INITIAL_INTAKE"]);

export function resolveInventoryMovementQuantity({
  action,
  quantity,
  type,
}: {
  action?: InventoryAction;
  quantity: number;
  type: string;
}) {
  const absoluteQuantity = Math.abs(quantity);

  if (type === "MANUAL_ADJUSTMENT" && action) {
    return action === "subtract" ? -absoluteQuantity : absoluteQuantity;
  }

  if (decrementTypes.has(type)) return -absoluteQuantity;
  if (incrementTypes.has(type)) return absoluteQuantity;

  return quantity;
}
