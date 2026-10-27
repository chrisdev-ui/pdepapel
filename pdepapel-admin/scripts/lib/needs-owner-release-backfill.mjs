/**
 * Una vez: las conversaciones que quedaron «es de Paula» por un traspaso del
 * bot antes de que esos traspasos vencieran (2026-10-27). El código nuevo las
 * libera 24 h después de lo último que salió; estas son de antes y siguen
 * paradas semanas después.
 *
 * Regla, la misma en el ensayo y al aplicar:
 *   status NEEDS_OWNER, needsOwnerReason vacío, sin pedido enlazado,
 *   Paula escribió por última vez hace más de 7 días y lo último que salió es suyo.
 *
 * Solo cambia `needsOwnerReason` a «owner_window»: la conversación sigue en
 * NEEDS_OWNER (el panel no cambia) hasta el siguiente mensaje de la clienta,
 * que el bot ya contesta (paso 0 y medio). No manda nada a nadie.
 *
 * Puro: lo usan `scripts/backfill-release-needs-owner.mjs` y sus pruebas.
 */

export const STALE_OWNER_DAYS = 7;

/**
 * Los ids que cumplen la regla, con lo que hace falta para deshacer.
 * @param {any} db
 * @param {{ storeId?: string | null, now?: Date }} [options]
 */
export async function planNeedsOwnerRelease(db, { storeId = null, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - STALE_OWNER_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db.conversation.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      status: "NEEDS_OWNER",
      needsOwnerReason: null,
      orderId: null,
      lastOwnerAt: { not: null, lt: cutoff },
    },
    select: { id: true, storeId: true, status: true, needsOwnerReason: true, lastOwnerAt: true },
    orderBy: { lastOwnerAt: "asc" },
  });
  const rows = [];
  for (const row of candidates) {
    const lastOut = await db.conversationMessage.findFirst({
      where: { conversationId: row.id, direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      select: { sentBy: true },
    });
    if (lastOut?.sentBy === "OWNER") rows.push(row);
  }
  return { cutoff, rows };
}

/** Cuántas por antigüedad del último mensaje de Paula, para el ensayo. */
export function summarizeByAge(rows, now = new Date()) {
  const buckets = { "7-14d": 0, "14-30d": 0, ">30d": 0 };
  for (const row of rows) {
    const days = (now.getTime() - new Date(row.lastOwnerAt).getTime()) / 86_400_000;
    if (days > 30) buckets[">30d"] += 1;
    else if (days > 14) buckets["14-30d"] += 1;
    else buckets["7-14d"] += 1;
  }
  return buckets;
}

/** Las líneas para volver atrás, a mano y con el mismo motivo aprobado. */
export function undoStatements(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => `'${String(row.id).replace(/'/g, "")}'`).join(", ");
  return [`UPDATE \`Conversation\` SET \`needsOwnerReason\` = NULL WHERE \`id\` IN (${ids}) AND \`needsOwnerReason\` = 'owner_window';`];
}

/**
 * Aplica el plan en una transacción. Vuelve a filtrar por la regla, así que
 * una fila que cambió desde el ensayo no se toca; si el conteo no es el del
 * plan, revierte todo.
 */
export async function applyNeedsOwnerRelease(db, plan) {
  const ids = plan.rows.map((row) => row.id);
  if (!ids.length) return 0;
  return db.$transaction(async (tx) => {
    const updated = await tx.conversation.updateMany({
      where: { id: { in: ids }, status: "NEEDS_OWNER", needsOwnerReason: null, orderId: null, lastOwnerAt: { lt: plan.cutoff } },
      data: { needsOwnerReason: "owner_window" },
    });
    if (updated.count !== ids.length) {
      throw new Error(`needs-owner-release: el plan tenía ${ids.length} y se cambiaron ${updated.count}; se revierte. Repite el ensayo.`);
    }
    return updated.count;
  });
}
