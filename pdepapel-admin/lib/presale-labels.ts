import { ProductPresaleStatus } from "@prisma/client";

export const PRESALE_STATUS_LABELS: Record<ProductPresaleStatus, string> = {
  [ProductPresaleStatus.ACTIVE]: "En preventa",
  [ProductPresaleStatus.RELEASED]: "Liberada",
  [ProductPresaleStatus.CANCELLED]: "Cancelada",
};
