import prismadb from "@/lib/prismadb";

/**
 * Turno de envío del bot por conversación. La fila de QStash serializa por
 * contacto, pero en el cambio de llave (teléfono → BSUID) o si un contacto
 * llegara por dos llaves, dos mensajes de la misma clienta pueden correr a la
 * vez. Antes de decidir, la corrida se queda con el turno hasta
 * `Conversation.botLeaseUntil`; ese valor es también su ficha: solo ella lo
 * extiende (su segundo mensaje) o lo suelta. Cada paso es una sola sentencia
 * condicional: un `updateMany` con guarda se compila en SELECT + UPDATE y dos
 * corridas ganarían las dos (ver lib/atomic-claim.ts).
 *
 * Las horas se comparan con el reloj de la aplicación, no con `NOW(3)`: así
 * no depende de la zona horaria de la sesión de MySQL.
 */
export const BOT_LEASE_TTL_MS = 45_000;
export const BOT_LEASE_POLL_MS = 2_000;
/** QStash corta la entrega a los 50 s: queda margen para enviar, soltar y responder. */
export const BOT_JOB_BUDGET_MS = 38_000;

export interface BotLease {
  token: Date | null;
  /** Sin turno a propósito (no se pudo reprogramar): se envía sin él y se avisa en el log. */
  bypass: boolean;
}

export const newBotLease = (): BotLease => ({ token: null, bypass: false });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Toma el turno, o lo extiende si ya es de esta corrida. */
export async function claimBotLease(conversationId: string, lease: BotLease, now = new Date()): Promise<boolean> {
  if (lease.bypass) return true;
  const token = new Date(now.getTime() + BOT_LEASE_TTL_MS + Math.floor(Math.random() * 1000));
  const mine = lease.token ?? new Date(0);
  const affected = await prismadb.$executeRaw`
    UPDATE \`Conversation\`
       SET \`botLeaseUntil\` = ${token}
     WHERE \`id\` = ${conversationId}
       AND (\`botLeaseUntil\` IS NULL OR \`botLeaseUntil\` < ${now} OR \`botLeaseUntil\` = ${mine})`;
  if (affected !== 1) return false;
  lease.token = token;
  return true;
}

/** Suelta el turno solo si sigue siendo de esta corrida. */
export async function releaseBotLease(conversationId: string, lease: BotLease): Promise<boolean> {
  if (!lease.token) return false;
  const affected = await prismadb.$executeRaw`
    UPDATE \`Conversation\`
       SET \`botLeaseUntil\` = NULL
     WHERE \`id\` = ${conversationId}
       AND \`botLeaseUntil\` = ${lease.token}`;
  lease.token = null;
  return affected === 1;
}

export type LeaseWait = { ok: true; waitedMs: number } | { ok: false; retryInMs: number };

/**
 * Espera el turno cada 2 s mientras quede presupuesto de la entrega. Una
 * corrida viva lo suelta en segundos (su propio chequeo antes de enviar ve el
 * mensaje nuevo y se calla); si no llega a tiempo —una corrida que se cayó
 * con el turno tomado—, devuelve cuándo vence para reprogramar.
 */
export async function acquireBotLease(conversationId: string, lease: BotLease, jobStartedAt: Date): Promise<LeaseWait> {
  const begin = Date.now();
  const deadline = jobStartedAt.getTime() + BOT_JOB_BUDGET_MS;
  for (;;) {
    if (await claimBotLease(conversationId, lease)) return { ok: true, waitedMs: Date.now() - begin };
    const held = await prismadb.conversation.findUnique({ where: { id: conversationId }, select: { botLeaseUntil: true } });
    const expiresIn = Math.max(0, (held?.botLeaseUntil?.getTime() ?? 0) - Date.now());
    const wait = Math.min(BOT_LEASE_POLL_MS, expiresIn + 50);
    if (Date.now() + wait > deadline) return { ok: false, retryInMs: expiresIn + 2_000 };
    await sleep(wait);
  }
}
