import {
  OrderStatus,
  PaymentMethod,
  ProductPresaleStatus,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { parseAvailableAt } from "@/lib/product-availability";

/**
 * Preventa: cobrar hoy por algo que llega después.
 *
 * Las reglas de negocio que confirmaron Paula y Christian, todas explícitas
 * aquí para que ninguna quede como comportamiento accidental:
 *
 * 1. **Pago completo al reservar.** No hay abonos ni cuotas. El pedido sigue
 *    el flujo de pago de siempre —nace PENDING y lo pasa a PAGADO el webhook
 *    de Bold o Wompi—, y por eso **una línea de preventa solo cuenta cuando el
 *    pedido está PAGADO**: el cupo, el dinero, las clientas y la liberación.
 *    Un carrito abandonado no reserva nada, igual que no descuenta stock.
 * 2. **Retrasos: avisar, y devolver a mano.** El sistema marca la preventa
 *    vencida y manda el aviso dejando registro; las devoluciones se hacen en
 *    Bold o Wompi por fuera, como cualquier otra. Aquí no se cancela ni se
 *    mueve plata sola.
 * 3. **Mercado Libre queda fuera** mientras la preventa esté ACTIVE.
 * 4. **El inventario no se entera.** `Product.stock` no se toca hasta liberar,
 *    y `committedUnits` solo se muestra en la pantalla de Preventas.
 * 5. **El pedido entero espera.** Si un pedido trae una línea de preventa sin
 *    liberar, no se despacha NADA de ese pedido, ni lo que ya estaba en
 *    bodega. Nunca se parte un envío.
 */

export const PRESALE_STATUS_LABELS: Record<ProductPresaleStatus, string> = {
  [ProductPresaleStatus.ACTIVE]: "En preventa",
  [ProductPresaleStatus.RELEASED]: "Liberada",
  [ProductPresaleStatus.CANCELLED]: "Cancelada",
};

// --- Regla 5: el freno es del PEDIDO, no de la línea ------------------------

/**
 * Pedidos con al menos una línea de preventa sin liberar.
 *
 * Se usa en negativo para excluirlos del despacho. Va por `some` a propósito:
 * basta UNA línea sin liberar para frenar el pedido completo.
 */
export const ORDER_HAS_UNRELEASED_PRESALE: Prisma.OrderWhereInput = {
  orderItems: { some: { isPreorder: true, preorderReleasedAt: null } },
};

/**
 * Lo que hay que añadir a cualquier consulta de «listo para despachar» para
 * que un pedido frenado por preventa no aparezca ni cuente como atrasado.
 */
export const ORDER_READY_TO_DISPATCH: Prisma.OrderWhereInput = {
  NOT: ORDER_HAS_UNRELEASED_PRESALE,
};

/** ¿Este pedido, ya cargado con sus líneas, está frenado por una preventa? */
export function isOrderHeldByPresale(order: {
  orderItems: { isPreorder: boolean; preorderReleasedAt: Date | null }[];
}): boolean {
  return order.orderItems.some(
    (item) => item.isPreorder && item.preorderReleasedAt === null,
  );
}

// --- Vencimiento -----------------------------------------------------------

/**
 * Vencida: sigue ACTIVE y ya pasó la fecha prometida. Es lo que enciende el
 * indicador de la pantalla y habilita «Notificar retraso».
 */
export function isPresaleOverdue(
  presale: { status: ProductPresaleStatus; expectedArrivalAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    presale.status === ProductPresaleStatus.ACTIVE &&
    presale.expectedArrivalAt.getTime() < now.getTime()
  );
}

export function overduePresaleWhere(
  now: Date = new Date(),
): Prisma.ProductPresaleWhereInput {
  return {
    status: ProductPresaleStatus.ACTIVE,
    expectedArrivalAt: { lt: now },
  };
}

// --- Capacidad -------------------------------------------------------------

/**
 * Cuánto tiempo un pedido sin pagar sigue ocupando cupo, pagando con tarjeta.
 *
 * Como el cupo se apunta al pagar, entre la caja y el pago la unidad no le
 * cuenta a nadie y la tienda acepta más pedidos de los que hay. Pasada la
 * ventana el pedido se da por abandonado y su unidad vuelve sola a la venta:
 * por eso no hace falta cron de expiración.
 *
 * Dos horas es generoso para una pasarela. El historial da poco: Bold no tiene
 * ni un `paidAt` fiable y de Wompi solo hay dos pagos (26 y 50 minutos), los
 * dos dentro de la ventana.
 */
export const PRESALE_HOLD_WINDOW_MINUTES = 120;

/**
 * La transferencia bancaria tarda otra cosa: el pedido queda PENDING hasta que
 * Paula confirma el pago a mano. Soltar la reserva antes de tiempo es peor que
 * la sobreventa que esto viene a arreglar, porque la unidad se le vendería a
 * otra clienta mientras la primera sigue esperando que le confirmen.
 *
 * Nueve días cubren el p95 medido (8,1 días) con algo de margen; el p99 (39,8
 * días) parece un caso viejo suelto y no la espera normal.
 *
 * El dato no es limpio: de 131 transferencias históricas, 74 traían `paidAt`
 * rellenado después y no sirven. Conviene rehacer la medición cuando se junten
 * transferencias nuevas con esta lógica ya en marcha.
 */
export const PRESALE_HOLD_WINDOW_TRANSFER_MINUTES = 12960;

/** Minutos que aparta un pedido según cómo se vaya a pagar. */
export function presaleHoldMinutes(
  method: PaymentMethod | null | undefined,
): number {
  return method === PaymentMethod.BankTransfer
    ? PRESALE_HOLD_WINDOW_TRANSFER_MINUTES
    : PRESALE_HOLD_WINDOW_MINUTES;
}

/** Desde cuándo cuenta un pedido sin pagar para el cupo. */
export function presaleHoldCutoff(
  now = new Date(),
  minutes = PRESALE_HOLD_WINDOW_MINUTES,
): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export interface PresaleCapacity {
  limit: number;
  /** Unidades pagadas. */
  committed: number;
  /** Unidades de pedidos recientes sin pagar: apartadas, todavía no vendidas. */
  held: number;
  remaining: number;
  /** Pagadas por encima del tope: nunca se rechaza un pago, así que puede pasar. */
  overCap: number;
}

export function getPresaleCapacity(presale: {
  unitLimit: number;
  committedUnits: number;
  heldUnits?: number;
}): PresaleCapacity {
  const held = Math.max(0, presale.heldUnits ?? 0);
  return {
    limit: presale.unitLimit,
    committed: presale.committedUnits,
    held,
    remaining: Math.max(0, presale.unitLimit - presale.committedUnits - held),
    overCap: Math.max(0, presale.committedUnits - presale.unitLimit),
  };
}

/**
 * Unidades apartadas por pedidos recientes sin pagar, por campaña. Los pagados
 * ya están en `committedUnits` y los cancelados no vuelven.
 *
 * `excludeOrdersOf` deja fuera los pedidos de quien compra ahora: si no, a
 * quien le rebotó la tarjeta su propio intento fallido le niega la reserva.
 */
export async function getHeldUnitsByPresale(
  presaleIds: string[],
  options: {
    now?: Date;
    excludeOrdersOf?: { userId?: string | null; guestId?: string | null };
  } = {},
): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (presaleIds.length === 0) return held;

  const now = options.now ?? new Date();
  const orderWhere: Prisma.OrderWhereInput = {
    status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] },
    // La ventana más larga acota la consulta; cada línea se filtra después con
    // la que le toca según su forma de pago.
    createdAt: {
      gte: presaleHoldCutoff(
        now,
        Math.max(
          PRESALE_HOLD_WINDOW_MINUTES,
          PRESALE_HOLD_WINDOW_TRANSFER_MINUTES,
        ),
      ),
    },
  };

  // Los pedidos propios se excluyen por id y no con un `NOT` sobre userId o
  // guestId: en SQL `NOT (guestId = 'x')` es desconocido cuando la columna es
  // NULL, así que se llevaba por delante a todos los demás pedidos.
  const { userId, guestId } = options.excludeOrdersOf ?? {};
  const mine: Prisma.OrderWhereInput[] = [];
  if (userId) mine.push({ userId });
  if (guestId) mine.push({ guestId });

  if (mine.length > 0) {
    const own = await prismadb.order.findMany({
      where: { ...orderWhere, OR: mine },
      select: { id: true },
    });
    if (own.length > 0) {
      orderWhere.id = { notIn: own.map((order) => order.id) };
    }
  }

  const rows = await prismadb.orderItem.findMany({
    where: {
      presaleId: { in: presaleIds },
      isPreorder: true,
      order: orderWhere,
    },
    select: {
      presaleId: true,
      quantity: true,
      order: {
        select: { createdAt: true, payment: { select: { method: true } } },
      },
    },
  });

  for (const row of rows) {
    if (!row.presaleId || !row.order) continue;
    const minutes = presaleHoldMinutes(row.order.payment?.method);
    if (row.order.createdAt < presaleHoldCutoff(now, minutes)) continue;
    held.set(row.presaleId, (held.get(row.presaleId) ?? 0) + row.quantity);
  }
  return held;
}

/** La preventa de un producto que está vendiendo ahora mismo, si la hay. */
export async function getActivePresale(storeId: string, productId: string) {
  return prismadb.productPresale.findFirst({
    where: { storeId, productId, status: ProductPresaleStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Anota las unidades vendidas de una preventa.
 *
 * **Cuándo**: al confirmarse el pago, dentro de la misma transacción del
 * webhook que escribe los movimientos de inventario. Exactamente igual que el
 * stock normal, y por la misma razón: un carrito abandonado o una tarjeta
 * rechazada no deben consumir cupo que nadie pagó. Si se apuntara al crear el
 * pedido haría falta un barrido de carritos vencidos, que este proyecto no
 * tiene.
 *
 * **Por qué no comprueba el tope**: aquí el dinero ya entró. Negarse a anotar
 * una unidad pagada haría mentir al contador. El tope se hace valer antes, en
 * el checkout, que es donde todavía se puede decir que no. Si dos pagos
 * simultáneos se pasan del cupo, el contador lo refleja y Paula lo ve en
 * Preventas; `getPresaleCapacity` ya recorta `remaining` a cero.
 *
 * Va en SQL crudo para que el incremento sea atómico entre transacciones
 * concurrentes: `committedUnits = committedUnits + n`, nunca leer y escribir.
 */
export async function commitPresaleUnits(
  tx: Prisma.TransactionClient,
  presaleId: string,
  units: number,
): Promise<void> {
  if (!Number.isInteger(units) || units <= 0) return;

  await tx.$executeRaw`
    UPDATE \`ProductPresale\`
       SET \`committedUnits\` = \`committedUnits\` + ${units},
           \`updatedAt\` = NOW(3)
     WHERE \`id\` = ${presaleId}`;
}

/**
 * Devuelve unidades al cupo cuando un pedido pagado se anula o se reembolsa.
 * Es el espejo de `commitPresaleUnits` y corre en la misma transacción que el
 * reingreso de stock. Nunca baja de cero, por si algo ya las devolvió.
 */
export async function releasePresaleUnits(
  tx: Prisma.TransactionClient,
  presaleId: string,
  units: number,
): Promise<void> {
  if (!Number.isInteger(units) || units <= 0) return;

  await tx.$executeRaw`
    UPDATE \`ProductPresale\`
       SET \`committedUnits\` = GREATEST(0, \`committedUnits\` - ${units}),
           \`updatedAt\` = NOW(3)
     WHERE \`id\` = ${presaleId}`;
}

/**
 * Qué es una línea de preventa que cuenta: la de un pedido **pagado**.
 *
 * Es la misma vara que el stock normal, que solo se mueve cuando entra la
 * plata. Sin este filtro, un carrito abandonado ocuparía cupo, inflaría el
 * «cobrado» de la pantalla y —lo grave— se llevaría mercancía al liberar,
 * descontando inventario por una venta que nunca existió.
 */
export const PAID_PRESALE_LINE = {
  isPreorder: true,
  order: { status: OrderStatus.PAID },
} satisfies Prisma.OrderItemWhereInput;

/**
 * Las líneas de preventa del pedido, **leídas dentro de la transacción**.
 *
 * No se reciben del pedido que cargó el webhook antes de abrirla: en ese
 * momento `preorderReleasedAt` todavía puede cambiar —Paula puede liberar la
 * campaña justo en ese intervalo— y decidir con un dato viejo significa no
 * reingresar stock que sí se descontó. `isPreorder` y `quantity` no cambian
 * nunca después de crear el pedido; `preorderReleasedAt` sí, así que se lee
 * aquí. Hay índice para esta consulta exacta: `[orderId, isPreorder,
 * preorderReleasedAt]`.
 */
async function readPresaleLines(tx: Prisma.TransactionClient, orderId: string) {
  return tx.orderItem.findMany({
    where: { orderId, isPreorder: true },
    select: {
      id: true,
      quantity: true,
      presaleId: true,
      preorderReleasedAt: true,
    },
  });
}

/**
 * Cuadra las líneas de preventa de un pedido que ACABA de pagarse.
 *
 * Corre dentro de la transacción del webhook, junto al descuento de stock, y
 * devuelve los ids de las líneas de preventa que **sí** deben descontar
 * inventario hoy. Hay dos casos y solo dos:
 *
 *  - **La preventa sigue esperando mercancía**: se suma el cupo y la línea no
 *    toca el inventario. Se descontará el día que Paula libere.
 *  - **La preventa ya se liberó** y el pago llegó tarde (la clienta pagó el
 *    enlace días después): la mercancía ya está en bodega, así que esta línea
 *    se comporta como una venta normal —descuenta ahora— y se marca liberada
 *    para que el pedido no quede frenado para siempre. Sin esto, ese pedido no
 *    se podría despachar nunca: la campaña ya no está ACTIVE y «Liberar» no
 *    vuelve a pasar por ahí.
 *
 * **Nunca tumba el pago.** Si algo falla apuntando el cupo, el error se
 * registra y la transacción sigue: el dinero ya entró y un pedido sin pagar en
 * la base es mucho peor que un contador corto, que además se ve descuadrado en
 * la pantalla de Preventas y se corrige a mano.
 */
export async function settlePresaleLinesOnPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
  now = new Date(),
): Promise<Set<string>> {
  const dispatchNow = new Set<string>();

  let waiting: Awaited<ReturnType<typeof readPresaleLines>>;
  try {
    waiting = (await readPresaleLines(tx, orderId)).filter(
      (line) => line.presaleId && line.preorderReleasedAt === null,
    );
  } catch (error) {
    console.error(
      "[PRESALE] No se pudieron leer las líneas de preventa al pagar:",
      {
        orderId,
        error,
      },
    );
    return dispatchNow;
  }
  if (waiting.length === 0) return dispatchNow;

  let releasedAt: Map<string, Date | null>;
  try {
    const presales = await tx.productPresale.findMany({
      where: {
        id: { in: Array.from(new Set(waiting.map((line) => line.presaleId!))) },
      },
      select: { id: true, releasedAt: true },
    });
    releasedAt = new Map(
      presales.map((presale) => [presale.id, presale.releasedAt]),
    );
  } catch (error) {
    console.error("[PRESALE] No se pudieron leer las campañas al pagar:", {
      orderId,
      error,
    });
    return dispatchNow;
  }

  const unitsByPresale = new Map<string, number>();
  for (const line of waiting) {
    if (releasedAt.get(line.presaleId!)) {
      dispatchNow.add(line.id);
      continue;
    }
    unitsByPresale.set(
      line.presaleId!,
      (unitsByPresale.get(line.presaleId!) ?? 0) + line.quantity,
    );
  }

  for (const [presaleId, units] of Array.from(unitsByPresale)) {
    try {
      await commitPresaleUnits(tx, presaleId, units);
    } catch (error) {
      // El pago sigue adelante a propósito: ver el comentario de arriba.
      console.error(
        "[PRESALE] El cupo no quedó apuntado en un pago confirmado:",
        {
          orderId,
          presaleId,
          units,
          error,
        },
      );
    }
  }

  if (dispatchNow.size > 0) {
    try {
      await tx.orderItem.updateMany({
        where: { id: { in: Array.from(dispatchNow) } },
        data: { preorderReleasedAt: now },
      });
    } catch (error) {
      // Sin la marca el pedido queda frenado, pero el inventario sí se
      // descontaría: se prefiere no descontar y dejarlo frenado, que es
      // reversible a mano.
      console.error(
        "[PRESALE] No se pudo marcar como liberada una línea de pago tardío:",
        {
          orderId,
          lineIds: Array.from(dispatchNow),
          error,
        },
      );
      dispatchNow.clear();
    }
  }

  return dispatchNow;
}

/**
 * El espejo: un pedido PAGADO que se anula o se reembolsa.
 *
 * Devuelve los ids de las líneas de preventa que sí deben REINGRESAR stock —
 * las que alcanzaron a liberarse, porque solo esas lo descontaron—, y por el
 * camino devuelve al cupo las que seguían esperando.
 *
 * El cupo solo se mueve mientras la campaña espera mercancía. Una vez
 * liberada, `committedUnits` es historia de lo que se vendió y no se reescribe
 * hacia atrás; lo que corrige la anulación ahí es el inventario, que es lo que
 * de verdad se movió.
 *
 * Si algo falla, no se reingresa nada: quedarse corto de stock lo cuadra un
 * conteo físico, mientras que inventar mercancía que no está hace vender lo
 * que no existe.
 */
export async function releasePresaleLinesOnCancellation(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<Set<string>> {
  const restock = new Set<string>();

  let lines: Awaited<ReturnType<typeof readPresaleLines>>;
  try {
    lines = await readPresaleLines(tx, orderId);
  } catch (error) {
    console.error(
      "[PRESALE] No se pudieron leer las líneas de preventa al anular:",
      {
        orderId,
        error,
      },
    );
    return restock;
  }
  if (lines.length === 0) return restock;

  const unitsByPresale = new Map<string, number>();
  for (const line of lines) {
    if (line.preorderReleasedAt !== null) {
      restock.add(line.id);
      continue;
    }
    if (!line.presaleId) continue;
    unitsByPresale.set(
      line.presaleId,
      (unitsByPresale.get(line.presaleId) ?? 0) + line.quantity,
    );
  }

  for (const [presaleId, units] of Array.from(unitsByPresale)) {
    try {
      await releasePresaleUnits(tx, presaleId, units);
    } catch (error) {
      console.error(
        "[PRESALE] El cupo no volvió a la campaña tras anular un pago:",
        {
          orderId,
          presaleId,
          units,
          error,
        },
      );
    }
  }

  return restock;
}

// --- Regla 3: Mercado Libre queda fuera ------------------------------------

/**
 * ¿Este producto tiene una preventa vendiendo ahora mismo?
 *
 * Es el candado de Mercado Libre. Conviene decir por qué existe, porque a
 * primera vista sobra: tanto la publicación como la sincronización calculan la
 * cantidad con `product.stock` en vivo, así que un producto sin stock ya sale
 * en cero por su cuenta.
 *
 * Sobra hasta que deja de sobrar, por dos caminos:
 *
 *  1. Nada obliga a que un producto en preventa tenga stock 0. Si Paula abre
 *     una preventa de 40 unidades sobre un producto que todavía tiene 5, esas
 *     5 se publican y el producto está a la venta en ML. «Fuera de Mercado
 *     Libre, punto» deja de ser cierto.
 *  2. El peor: al LIBERAR, el stock sube de golpe con la mercancía que llegó
 *     (0 → 40) y baja otra vez a medida que los pedidos de preventa consumen
 *     sus unidades. Cualquier `SYNC_STOCK` que caiga en esa ventana le publica
 *     40 unidades reales a Mercado Libre, y una compra de allá se lleva
 *     unidades ya vendidas y cobradas a una clienta de la tienda.
 *
 * Ese segundo caso es una sobreventa en el sitio que más castiga el despacho
 * tarde, y no lo evita ninguna regla existente. Por eso el candado es
 * explícito y no una consecuencia de que el stock esté en cero.
 */
export async function hasActivePresale(productId: string): Promise<boolean> {
  const count = await prismadb.productPresale.count({
    where: { productId, status: ProductPresaleStatus.ACTIVE },
  });
  return count > 0;
}

/**
 * Preventas activas de varios productos, indexadas por producto. Una consulta
 * para todo el carrito en vez de una por línea.
 */
export async function getActivePresalesByProduct(
  storeId: string,
  productIds: string[],
  options: {
    now?: Date;
    excludeOrdersOf?: { userId?: string | null; guestId?: string | null };
  } = {},
) {
  const empty = new Map<
    string,
    {
      id: string;
      unitLimit: number;
      committedUnits: number;
      heldUnits: number;
      expectedArrivalAt: Date;
    }
  >();
  if (productIds.length === 0) return empty;

  const rows = await prismadb.productPresale.findMany({
    where: {
      storeId,
      productId: { in: productIds },
      status: ProductPresaleStatus.ACTIVE,
    },
    select: {
      id: true,
      productId: true,
      unitLimit: true,
      committedUnits: true,
      expectedArrivalAt: true,
    },
  });

  // Lo apartado por pedidos recientes sin pagar cuenta igual que lo vendido:
  // si no, la caja acepta más pedidos de los que hay mientras nadie paga.
  const held = await getHeldUnitsByPresale(
    rows.map((row) => row.id),
    options,
  );

  for (const row of rows) {
    empty.set(row.productId, {
      id: row.id,
      unitLimit: row.unitLimit,
      committedUnits: row.committedUnits,
      heldUnits: held.get(row.id) ?? 0,
      expectedArrivalAt: row.expectedArrivalAt,
    });
  }
  return empty;
}

/** Igual que `hasActivePresale` pero para varios productos de una vez. */
export async function getProductsWithActivePresale(
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await prismadb.productPresale.findMany({
    where: {
      productId: { in: productIds },
      status: ProductPresaleStatus.ACTIVE,
    },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

export const PRESALE_BLOCKS_MARKETPLACE_MESSAGE =
  "Este producto está en preventa: no se publica en Mercado Libre hasta que liberes las unidades reservadas.";

// --- Entrada de la API -----------------------------------------------------

export const PRESALE_MAX_UNIT_LIMIT = 9999;

// `required_error` va en todos: sin él, un campo que no llega produce el
// "Required" en inglés de zod, y esto es un panel en español.
export const presaleInputSchema = z.object({
  productId: z
    .string({ required_error: "Elige el producto" })
    .trim()
    .min(1, "Elige el producto"),
  /** `yyyy-MM-dd` o ISO. Se interpreta en hora de Bogotá. */
  expectedArrivalAt: z
    .string({ required_error: "Ponle la fecha en que llega" })
    .trim()
    .min(1, "Ponle la fecha en que llega"),
  unitLimit: z
    .number({
      required_error: "Di cuántas unidades puedes prometer",
      invalid_type_error: "Las unidades tienen que ser un número",
    })
    .int("Tiene que ser un número entero")
    .min(1, "Promete al menos una unidad")
    .max(PRESALE_MAX_UNIT_LIMIT, "Son demasiadas unidades"),
});

export type PresaleInput = z.infer<typeof presaleInputSchema>;

/**
 * La fecha prometida tiene que estar en el futuro: una preventa que "llega"
 * ayer nace vencida y le promete a la clienta algo ya incumplido.
 */
export function parsePresaleInput(
  body: unknown,
  now: Date = new Date(),
): {
  productId: string;
  expectedArrivalAt: Date;
  unitLimit: number;
} {
  // Los fallos del esquema los traduce `handleErrorResponse`, que convierte
  // cualquier ZodError en un 400 con el mensaje del primer campo. Las reglas
  // de negocio de más abajo sí se lanzan aquí, porque no son de esquema.
  const parsed = presaleInputSchema.parse(body);

  const expectedArrivalAt = parseAvailableAt(parsed.expectedArrivalAt);
  if (!expectedArrivalAt) {
    throw ErrorFactory.InvalidRequest("La fecha de llegada no es válida");
  }
  if (expectedArrivalAt.getTime() <= now.getTime()) {
    throw ErrorFactory.InvalidRequest(
      "La fecha de llegada tiene que ser futura: una preventa no puede prometer algo para ayer.",
    );
  }
  return {
    productId: parsed.productId,
    expectedArrivalAt,
    unitLimit: parsed.unitLimit,
  };
}
