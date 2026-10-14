import prismadb from "@/lib/prismadb";

/** Filtro de base de datos para «hay algo que vender»: stock mayor que lo apartado. */
export function availableStockWhere() {
  return { stock: { gt: prismadb.product.fields.reservedUnits } };
}
