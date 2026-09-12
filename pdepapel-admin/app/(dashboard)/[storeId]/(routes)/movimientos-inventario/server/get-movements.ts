import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs/server";
import { subDays } from "date-fns";

/** Ventana por defecto del kardex: lo reciente es lo que se revisa a diario. */
export const MOVEMENTS_WINDOW_DAYS = 90;
/** Filas máximas dentro de la ventana por defecto. */
export const MOVEMENTS_WINDOW_TAKE = 500;
/** Tope al pedir «todo el historial»: la tabla se pagina en memoria. */
export const MOVEMENTS_ALL_TAKE = 2000;

export interface GetInventoryMovementsOptions {
  /** Movimientos de una referencia (feria, pedido, orden de aprovisionamiento): sin ventana ni tope. */
  referenceId?: string | null;
  /** Solo los movimientos de un producto. */
  productId?: string | null;
  /**
   * Días hacia atrás. `null` lifts the window (todo el historial, con tope
   * `MOVEMENTS_ALL_TAKE`); por defecto `MOVEMENTS_WINDOW_DAYS`.
   */
  sinceDays?: number | null;
  /** Tope de filas; por defecto depende de la ventana. */
  take?: number;
  /** Para pruebas: «ahora». */
  now?: Date;
}

interface ClerkUserLite {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  hasImage: boolean;
  imageUrl: string;
}

const SYSTEM_LABELS: Record<string, string> = {
  SYSTEM_PAYU: "PayU",
  SYSTEM_WOMPI: "Wompi",
  SYSTEM_BOLD: "Bold",
  SYSTEM: "Sistema",
  SYSTEM_MIGRATION_SCRIPT: "Migración",
};

const ORDER_LINKED_TYPES = new Set(["ORDER_PLACED", "ORDER_CANCELLED", "IN_PERSON_SALE"]);

/** Nombres y fotos de Clerk por id; nunca tumba la página si Clerk falla. */
async function resolveClerkUsers(userIds: Iterable<string>): Promise<Map<string, ClerkUserLite>> {
  const users = new Map<string, ClerkUserLite>();
  const ids = Array.from(userIds);
  if (ids.length === 0) return users;
  try {
    const client = await clerkClient();
    await Promise.all(
      ids.map(async (userId) => {
        try {
          const user = await client.users.getUser(userId);
          if (user) users.set(userId, user);
        } catch (error) {
          console.error(`[INVENTORY_MOVEMENTS] No se pudo resolver el usuario ${userId}`, error);
        }
      }),
    );
  } catch (error) {
    console.error("[INVENTORY_MOVEMENTS] Clerk no disponible; se muestran los movimientos sin nombres", error);
  }
  return users;
}

export const getInventoryMovements = async (storeId: string, options: GetInventoryMovementsOptions = {}) => {
  const referenceId = options.referenceId?.trim() || null;
  const productId = options.productId?.trim() || null;
  const now = options.now ?? new Date();
  const windowDays = referenceId ? null : options.sinceDays === undefined ? MOVEMENTS_WINDOW_DAYS : options.sinceDays;
  const take = referenceId ? undefined : (options.take ?? (windowDays === null ? MOVEMENTS_ALL_TAKE : MOVEMENTS_WINDOW_TAKE));

  const movements = await prismadb.inventoryMovement.findMany({
    where: {
      storeId,
      ...(referenceId ? { referenceId } : {}),
      ...(productId ? { productId } : {}),
      ...(windowDays !== null ? { createdAt: { gte: subDays(now, windowDays) } } : {}),
    },
    select: {
      id: true,
      productId: true,
      type: true,
      quantity: true,
      previousStock: true,
      newStock: true,
      cost: true,
      price: true,
      reason: true,
      description: true,
      referenceId: true,
      createdAt: true,
      createdBy: true,
      product: {
        select: {
          name: true,
          sku: true,
          images: { where: { isMain: true }, take: 1, select: { url: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    // Una fila de más para saber si el tope dejó movimientos por fuera.
    ...(take !== undefined ? { take: take + 1 } : {}),
  });
  const hasMore = take !== undefined && movements.length > take;
  const rows = hasMore ? movements.slice(0, take) : movements;

  const uniqueUserIds = new Set<string>();
  const orderIds = new Set<string>();
  for (const item of rows) {
    if (item.createdBy && !item.createdBy.startsWith("SYSTEM")) uniqueUserIds.add(item.createdBy.replace("USER_", ""));
    if (ORDER_LINKED_TYPES.has(item.type) && item.referenceId) orderIds.add(item.referenceId);
  }

  const [usersMap, orders, store] = await Promise.all([
    resolveClerkUsers(uniqueUserIds),
    orderIds.size > 0
      ? prismadb.order.findMany({
          where: { storeId, id: { in: Array.from(orderIds) } },
          select: { id: true, fullName: true, userId: true, email: true },
        })
      : Promise.resolve([]),
    prismadb.store.findUnique({ where: { id: storeId }, select: { userId: true } }),
  ]);
  const ordersMap = new Map(orders.map((order) => [order.id, order]));

  const formatted = rows.map((item) => {
    let userName = "Sistema";
    let userImage = "";
    let isOwner = false;
    const clerkId = item.createdBy && !item.createdBy.startsWith("SYSTEM") ? item.createdBy.replace("USER_", "") : null;
    const user = clerkId ? usersMap.get(clerkId) : undefined;
    const linkedOrder = item.referenceId ? ordersMap.get(item.referenceId) : undefined;

    if (linkedOrder) {
      // El cliente del pedido (invitado o registrado) importa más que quien disparó el movimiento.
      userName = linkedOrder.fullName ? `${linkedOrder.fullName}${linkedOrder.userId ? "" : " (Invitado)"}` : linkedOrder.email || "Cliente";
      if (user?.hasImage) userImage = user.imageUrl;
    } else if (clerkId) {
      isOwner = store?.userId === clerkId;
      userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Usuario" : "Usuario desconocido";
      userImage = user?.hasImage ? user.imageUrl : "";
    } else if (item.createdBy?.startsWith("SYSTEM")) {
      userName = SYSTEM_LABELS[item.createdBy] || item.createdBy;
      if (item.createdBy === "SYSTEM_MIGRATION_SCRIPT") userImage = "BOT";
    }

    return {
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productSku: item.product.sku,
      productImage: item.product.images[0]?.url ?? null,
      type: item.type,
      quantity: item.quantity,
      reason: item.reason || "",
      description: item.description || "",
      referenceId: item.referenceId ?? null,
      createdAt: item.createdAt,
      userName,
      userImage,
      isOwner,
      previousStock: item.previousStock,
      newStock: item.newStock,
      cost: item.cost ?? 0,
      price: item.price ?? 0,
    };
  });

  return {
    movements: formatted,
    /** El tope dejó movimientos por fuera (solo con ventana o «todo»). */
    hasMore,
    /** Días de la ventana aplicada; null si se pidió una referencia o todo el historial. */
    windowDays,
    /** Tope aplicado; undefined con referencia. */
    take,
  };
};

export type InventoryMovementRow = Awaited<ReturnType<typeof getInventoryMovements>>["movements"][number];
