/**
 * La forma de una feria tal como la sirve la página, ya depurada para una
 * cuenta de solo lectura. Vive aparte porque las cuatro fases y el panel de
 * venta la comparten, y antes estaba dentro del taller de 1.500 líneas.
 */
export type FairStatus = "DRAFT" | "OPEN" | "RECONCILING" | "CLOSED" | "CANCELLED";

export type FairProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  acqPrice: number | null;
  gtin: string | null;
  isKit: boolean;
  images: { url: string }[];
};

/** Una pieza de un kit reservado, con la receta congelada al reservar. */
export type FairKitComponentLine = {
  componentId: string;
  name: string;
  sku: string;
  quantityPerKit: number;
};

export type FairInventoryItem = {
  id: string;
  productId: string;
  allocatedQuantity: number;
  soldQuantity: number;
  packedQuantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
  product: FairProduct;
  /** Vacío en un producto suelto. */
  kitComponents: FairKitComponentLine[];
};

export type FairCapsule = {
  id: string;
  code: string;
  salePrice: number;
  /** Nulos en una cuenta de solo lectura: `scrubFairEvent` los quita. */
  productCost: number | null;
  minimumMarginPct: number | null;
  status: "PACKED" | "SOLD" | "VOID";
  product: { id: string; name: string; sku: string };
};

export type FairOrder = {
  id: string;
  orderNumber: string;
  status: "PAID" | "CANCELLED";
  total: number;
  createdAt: string;
  payment: { method: "CASH" | "BankTransfer"; proofKey: string | null } | null;
  orderItems: { id: string; name: string; quantity: number; price: number }[];
};

export type FairEventDetail = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: FairStatus;
  notes: string | null;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  inventoryItems: FairInventoryItem[];
  capsules: FairCapsule[];
  orders: FairOrder[];
};
