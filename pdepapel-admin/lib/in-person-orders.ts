import { OrderType } from "@prisma/client";

/**
 * Ventas presenciales (punto de venta y feria): se crean desde su propio
 * módulo, nacen pagadas y se conservan como comprobantes. El módulo de
 * Pedidos no las edita, cancela ni elimina; una feria concilia sus ventas
 * desde la feria y una venta de mostrador se corrige con una devolución o
 * un ajuste de inventario. Puro y compartido por las rutas individuales y
 * por lote.
 */
export const IN_PERSON_ORDER_TYPES: OrderType[] = [OrderType.POINT_OF_SALE, OrderType.FESTIVAL];

export function isInPersonOrderType(type: OrderType | null | undefined): boolean {
  return !!type && IN_PERSON_ORDER_TYPES.includes(type);
}

export function inPersonOrderLabel(type: OrderType): string {
  return type === OrderType.FESTIVAL ? "venta de feria" : "venta presencial";
}

/** Copy de las guardas, por tipo y por gesto. */
export const IN_PERSON_ORDER_GUARD_COPY = {
  edit: {
    [OrderType.POINT_OF_SALE]:
      "Las ventas presenciales se conservan como comprobantes. Registra una devolución o ajuste de inventario en lugar de editar esta orden.",
    [OrderType.FESTIVAL]:
      "Las ventas de feria se conservan como comprobantes. Para anular una venta, hazlo desde la feria (Ferias → la feria → Ventas).",
  },
  delete: {
    [OrderType.POINT_OF_SALE]:
      "Las ventas presenciales no se eliminan. Registra una devolución o ajuste de inventario para conservar la trazabilidad.",
    [OrderType.FESTIVAL]:
      "Las ventas de feria no se eliminan. Anúlala desde la feria para que el inventario reservado cuadre.",
  },
  convert: {
    [OrderType.POINT_OF_SALE]:
      "No puedes convertir una orden existente en venta presencial. Regístrala desde Punto de venta.",
    [OrderType.FESTIVAL]:
      "No puedes convertir una orden existente en venta de feria. Regístrala desde la feria.",
  },
} as const;

type GuardedType = typeof OrderType.POINT_OF_SALE | typeof OrderType.FESTIVAL;

/** Mensaje de la guarda para un pedido presencial; `null` si el tipo no lo es. */
export function getInPersonOrderGuard(type: OrderType, gesture: keyof typeof IN_PERSON_ORDER_GUARD_COPY): string | null {
  if (!isInPersonOrderType(type)) return null;
  return IN_PERSON_ORDER_GUARD_COPY[gesture][type as GuardedType];
}

/**
 * Mensaje para un lote que incluye ventas presenciales: todo o nada, como el
 * resto de reglas del lote. Lista hasta cinco números de pedido.
 */
export function describeInPersonOrdersInBatch(orders: Array<{ orderNumber: string; type: OrderType }>, gesture: "edit" | "delete"): string | null {
  const inPerson = orders.filter((order) => isInPersonOrderType(order.type));
  if (inPerson.length === 0) return null;
  const listed = inPerson.slice(0, 5).map((order) => `${order.orderNumber} (${inPersonOrderLabel(order.type)})`).join(", ");
  const extra = inPerson.length > 5 ? ` y ${inPerson.length - 5} más` : "";
  const verb = gesture === "delete" ? "se eliminan" : "se editan";
  const one = inPerson.length === 1;
  return `${one ? "Un pedido es" : `${inPerson.length} pedidos son`} ${one ? "una venta presencial o de feria" : "ventas presenciales o de feria"} y no ${verb} desde Pedidos: ${listed}${extra}. Las de mostrador se corrigen con una devolución o ajuste de inventario y las de feria se anulan desde la feria. No se cambió ninguno.`;
}
