import prismadb from "@/lib/prismadb";

/**
 * Reclama una fila de cola para procesarla, en una sola sentencia.
 *
 * `updateMany` con guarda de estado NO sirve para esto: Prisma lo compila en
 * un SELECT que lleva la guarda y un UPDATE por id que no la lleva, así que
 * fuera de una transacción Serializable dos entregas simultáneas se reclaman
 * las dos y el evento se procesa dos veces. Una sola sentencia no depende del
 * aislamiento.
 *
 * Devuelve true solo para quien se quedó con la fila.
 */
export async function claimQueueRow(input: {
  table: "MarketplaceWebhookEvent" | "MarketplaceOutboxEvent";
  id: string;
  /** Estados desde los que se puede reclamar. */
  from: string[];
  /** Columna de «disponible desde»; la fila solo se toma si ya venció. */
  dueColumn: "nextRetryAt" | "availableAt";
  /** `nextRetryAt` admite NULL como «sin espera»; `availableAt` no. */
  dueNullMeansReady: boolean;
  now: Date;
}): Promise<boolean> {
  const { table, id, from, dueColumn, dueNullMeansReady, now } = input;

  // Los nombres de tabla/columna vienen de esta unión de literales, nunca de
  // datos externos; los valores sí van parametrizados.
  const states = from.map((state) => `'${state}'`).join(", ");
  const dueClause = dueNullMeansReady
    ? `(\`${dueColumn}\` IS NULL OR \`${dueColumn}\` <= ?)`
    : `\`${dueColumn}\` <= ?`;

  const affected = await prismadb.$executeRawUnsafe(
    `UPDATE \`${table}\`
        SET \`status\` = 'PROCESSING',
            \`attempts\` = \`attempts\` + 1,
            ${dueNullMeansReady ? `\`${dueColumn}\` = NULL,` : ""}
            \`lastError\` = NULL,
            \`updatedAt\` = NOW(3)
      WHERE \`id\` = ?
        AND \`status\` IN (${states})
        AND ${dueClause}`,
    id,
    now,
  );

  return affected === 1;
}
