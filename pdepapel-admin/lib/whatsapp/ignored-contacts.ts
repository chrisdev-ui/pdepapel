import prismadb from "@/lib/prismadb";

/**
 * Contactos que el panel ignora: ni cuota de QStash, ni conversación, ni bot.
 *
 * El corte se hace en el webhook, **antes de encolar**, porque la cuota se
 * gasta al publicar y no al procesar. El evento crudo se guarda igual, así
 * que dejar de ignorar a alguien recupera lo que llegó mientras tanto.
 *
 * Toda la comparación es exacta. No hay prefijos, ni «contiene», ni indicativo
 * suelto: una coincidencia de más deja a una clienta real sin respuesta y sin
 * que nadie se entere, que es peor que el problema que esto resuelve.
 */

/**
 * Marca que queda en `lastError` del evento que no se encoló.
 *
 * Va en `lastError` y no en un estado propio para no migrar el enum: el
 * evento se cierra como PROCESSED —que es lo que hace que la limpieza de 30
 * días se lo lleve y que ninguna recuperación lo retome— y esta línea explica
 * por qué nunca se expandió a conversación.
 */
export const IGNORED_EVENT_NOTE =
  "IGNORADO: el contacto está en la lista de ignorados; el evento se guardó sin encolar.";

export interface ContactIdentity {
  phone?: string | null;
  bsuid?: string | null;
}

export interface IgnoredContactRule {
  phone: string | null;
  bsuid: string | null;
}

/** Deja el teléfono como lo guarda el webhook: solo dígitos, o `null`. */
export function normalizeIgnoredPhone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

/** El BSUID va tal cual, sin tocar mayúsculas: Meta lo manda ya con su forma. */
export function normalizeIgnoredBsuid(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

/**
 * ¿Alguna regla tapa a este contacto?
 *
 * Puro y exacto: compara identidades completas. Una regla sin teléfono ni
 * BSUID no tapa a nadie —sería una regla que ignora a todo el mundo—, y una
 * identidad vacía tampoco empareja con nada.
 */
export function matchesIgnoredContact(
  rules: readonly IgnoredContactRule[],
  identity: ContactIdentity,
): boolean {
  const phone = normalizeIgnoredPhone(identity.phone);
  const bsuid = normalizeIgnoredBsuid(identity.bsuid);
  if (!phone && !bsuid) return false;

  return rules.some((rule) => {
    const rulePhone = normalizeIgnoredPhone(rule.phone);
    const ruleBsuid = normalizeIgnoredBsuid(rule.bsuid);
    if (!rulePhone && !ruleBsuid) return false;
    if (rulePhone && phone && rulePhone === phone) return true;
    return Boolean(ruleBsuid && bsuid && ruleBsuid === bsuid);
  });
}

/**
 * Consulta la lista de una tienda.
 *
 * Una sola consulta acotada por identidad, no la lista entera: la lista es
 * corta hoy, pero esto corre en el camino caliente del webhook y no debe
 * crecer con ella.
 */
export async function findIgnoredContact(
  storeId: string,
  identity: ContactIdentity,
): Promise<{ id: string } | null> {
  const phone = normalizeIgnoredPhone(identity.phone);
  const bsuid = normalizeIgnoredBsuid(identity.bsuid);
  if (!phone && !bsuid) return null;

  const conditions: { phone?: string; bsuid?: string }[] = [];
  if (phone) conditions.push({ phone });
  if (bsuid) conditions.push({ bsuid });

  return prismadb.ignoredContact.findFirst({
    where: { storeId, OR: conditions },
    select: { id: true },
  });
}

/**
 * Lleva la cuenta de lo que se dejó pasar.
 *
 * Un UPDATE por evento saltado, a cambio de no publicar en QStash ni procesar
 * nada: sale barato y es lo que permite decirle a Paula cuántos mensajes hay
 * sin reflejar sin tener que rastrear los payloads guardados. Nunca hace
 * fallar al webhook.
 */
export async function countSkippedEvent(ignoredContactId: string): Promise<void> {
  try {
    await prismadb.ignoredContact.update({
      where: { id: ignoredContactId },
      data: { skippedCount: { increment: 1 }, lastSkippedAt: new Date() },
    });
  } catch (error) {
    console.warn("[IGNORED_CONTACT] No se pudo contar el evento saltado", error);
  }
}

export interface IgnoredContactRow {
  id: string;
  phone: string | null;
  bsuid: string | null;
  reason: string;
  createdByUserId: string;
  createdAt: Date;
}

export async function listIgnoredContacts(storeId: string): Promise<IgnoredContactRow[]> {
  return prismadb.ignoredContact.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    select: { id: true, phone: true, bsuid: true, reason: true, createdByUserId: true, createdAt: true },
  });
}

export const IGNORE_REASON_MIN_LENGTH = 10;
export const IGNORE_REASON_MAX_LENGTH = 500;

/** `null` cuando el motivo no sirve; si no, el motivo ya recortado. */
export function validateIgnoreReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const reason = raw.trim().replace(/\s+/g, " ");
  if (reason.length < IGNORE_REASON_MIN_LENGTH) return null;
  return reason.slice(0, IGNORE_REASON_MAX_LENGTH);
}
