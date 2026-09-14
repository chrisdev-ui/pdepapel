import { ProductPresaleStatus, type Prisma } from "@prisma/client";
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
 * 1. **Pago completo al reservar.** No hay abonos ni cuotas. El pedido nace
 *    PAGADO como cualquier otro y el flujo de pago no se toca.
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

export function overduePresaleWhere(now: Date = new Date()): Prisma.ProductPresaleWhereInput {
  return { status: ProductPresaleStatus.ACTIVE, expectedArrivalAt: { lt: now } };
}

// --- Capacidad -------------------------------------------------------------

export interface PresaleCapacity {
  limit: number;
  committed: number;
  remaining: number;
}

export function getPresaleCapacity(presale: {
  unitLimit: number;
  committedUnits: number;
}): PresaleCapacity {
  return {
    limit: presale.unitLimit,
    committed: presale.committedUnits,
    remaining: Math.max(0, presale.unitLimit - presale.committedUnits),
  };
}

/** La preventa de un producto que está vendiendo ahora mismo, si la hay. */
export async function getActivePresale(storeId: string, productId: string) {
  return prismadb.productPresale.findFirst({
    where: { storeId, productId, status: ProductPresaleStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Reserva unidades sin pasarse del tope, aunque entren dos compras a la vez.
 *
 * Va en SQL crudo a propósito. El candado que usa el inventario
 * (`updateMany` con `stock: { gte: n }`) compara una columna contra un número,
 * y Prisma sabe hacer eso. Aquí hay que comparar DOS columnas
 * (`committedUnits + n <= unitLimit`), que Prisma no expresa en un `where`.
 * Leer y después escribir dejaría una ventana por la que dos clientas se
 * llevan la última unidad; una sola sentencia condicional no la deja.
 *
 * Devuelve `false` cuando ya no cabe, y quien llama decide qué contarle a la
 * clienta.
 */
export async function reservePresaleUnits(
  tx: Prisma.TransactionClient,
  presaleId: string,
  units: number,
): Promise<boolean> {
  if (!Number.isInteger(units) || units <= 0) return false;

  const affected = await tx.$executeRaw`
    UPDATE \`ProductPresale\`
       SET \`committedUnits\` = \`committedUnits\` + ${units},
           \`updatedAt\` = NOW(3)
     WHERE \`id\` = ${presaleId}
       AND \`status\` = 'ACTIVE'
       AND \`committedUnits\` + ${units} <= \`unitLimit\``;

  return affected === 1;
}

/**
 * Devuelve unidades al tope cuando una reserva no llegó a convertirse en
 * pedido. Nunca baja de cero, por si algo ya las devolvió.
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
) {
  const empty = new Map<string, { id: string; unitLimit: number; committedUnits: number; expectedArrivalAt: Date }>();
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

  for (const row of rows) {
    empty.set(row.productId, {
      id: row.id,
      unitLimit: row.unitLimit,
      committedUnits: row.committedUnits,
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
    where: { productId: { in: productIds }, status: ProductPresaleStatus.ACTIVE },
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
export function parsePresaleInput(body: unknown, now: Date = new Date()): {
  productId: string;
  expectedArrivalAt: Date;
  unitLimit: number;
} {
  // Los fallos de validación salen como AppError, no como ZodError.
  // `handleErrorResponse` no distingue un ZodError de un fallo cualquiera y lo
  // convierte en «Error interno del servidor» con 500, así que quien está
  // usando el panel vería un error de sistema por escribir una fecha pasada.
  let parsed: PresaleInput;
  try {
    parsed = presaleInputSchema.parse(body);
  } catch (error) {
    throw toInvalidRequest(error);
  }

  const expectedArrivalAt = parseAvailableAt(parsed.expectedArrivalAt);
  if (!expectedArrivalAt) {
    throw ErrorFactory.InvalidRequest("La fecha de llegada no es válida");
  }
  if (expectedArrivalAt.getTime() <= now.getTime()) {
    throw ErrorFactory.InvalidRequest(
      "La fecha de llegada tiene que ser futura: una preventa no puede prometer algo para ayer.",
    );
  }
  return { productId: parsed.productId, expectedArrivalAt, unitLimit: parsed.unitLimit };
}

/** Primer mensaje del ZodError, que es el que le sirve a quien llenó el formulario. */
function toInvalidRequest(error: unknown) {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return ErrorFactory.InvalidRequest(first?.message ?? "Los datos de la preventa no son válidos");
  }
  return error;
}
