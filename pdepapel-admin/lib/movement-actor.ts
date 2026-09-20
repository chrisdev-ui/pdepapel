/**
 * Quién hizo un movimiento, en una sola forma.
 *
 * `InventoryMovement.createdBy` se guardó de dos maneras para la misma
 * persona: el id de Clerk a secas (2.158 filas en producción) y con el prefijo
 * `USER_` (1.040). El kardex solo resolvía el nombre de las prefijadas, así
 * que la mayoría de las filas mostraba «—» en la columna «Quién».
 *
 * Desde aquí: se escribe el id a secas, y los actores automáticos siguen
 * llevando el prefijo `SYSTEM`. Quien lee acepta las dos formas, porque las
 * filas históricas no se tocan.
 *
 * Sin Prisma ni React a propósito: lo importan rutas de servidor y componentes.
 */

export interface MovementActor {
  /** Lo escribió un proceso automático (webhook de pago, Mercado Libre, script). */
  system: boolean;
  /** Id de Clerk ya sin prefijo, o null si no lo hizo una persona. */
  userId: string | null;
}

export function normalizeMovementActor(createdBy: string | null | undefined): MovementActor {
  const value = createdBy?.trim();
  if (!value) return { system: false, userId: null };
  if (value.startsWith("SYSTEM")) return { system: true, userId: null };
  return { system: false, userId: value.startsWith("USER_") ? value.slice("USER_".length) : value };
}

/** Lo que se guarda en `createdBy` para una persona: el id de Clerk, sin prefijo. */
export function movementActor(userId: string | null | undefined): string {
  return normalizeMovementActor(userId).userId ?? "SYSTEM";
}

/** Ids de Clerk que hay que resolver a nombres para estas filas. */
export function collectMovementActorIds(movements: { createdBy: string | null }[]): Set<string> {
  const ids = new Set<string>();
  for (const movement of movements) {
    const actor = normalizeMovementActor(movement.createdBy);
    if (actor.userId) ids.add(actor.userId);
  }
  return ids;
}
