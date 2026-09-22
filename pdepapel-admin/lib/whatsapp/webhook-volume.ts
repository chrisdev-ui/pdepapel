import { MarketplaceProvider } from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Vigilancia del gasto diario de QStash por los eventos de WhatsApp.
 *
 * Cada evento —el que entra y el eco de lo que contesta Paula— cuesta una
 * publicación, y el plan da 1000 al día. El 21 de septiembre de 2026 se
 * llegaron a 1104: la cuota se agotó a media tarde y los mensajes de clientas
 * reales dejaron de procesarse **en silencio** durante horas. Nadie se enteró
 * hasta el día siguiente.
 *
 * Esto no evita el tope; avisa con margen para que dé tiempo a reaccionar
 * (ignorar al contacto que esté disparando el volumen, casi siempre).
 */

/** Tope del plan de QStash, para poder decir cuánto margen queda. */
export const QSTASH_DAILY_CAP = 1000;

/** Aviso con margen: a 700 todavía quedan 300 para el resto del día. */
export const DEFAULT_VOLUME_THRESHOLD = 700;

export function resolveVolumeThreshold(
  environment: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(environment.WHATSAPP_WEBHOOK_DAILY_ALERT);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_VOLUME_THRESHOLD;
  // Avisar por encima del tope no sirve de nada: para entonces ya se cayó.
  return Math.min(Math.floor(raw), QSTASH_DAILY_CAP);
}

export interface VolumeVerdict {
  total: number;
  threshold: number;
  /** `true` cuando toca avisar: se cruzó el umbral. */
  alert: boolean;
  /** Cuántos eventos caben todavía antes del tope del plan. */
  remaining: number;
  detail: string;
}

/**
 * Decide si hoy hay que avisar. Puro: recibe el conteo ya hecho.
 *
 * El texto es el que ve Paula en «Sistemas», así que dice qué pasa y qué
 * hacer, no solo un número.
 */
export function judgeWebhookVolume(input: {
  total: number;
  threshold: number;
  topContact?: { label: string; count: number } | null;
}): VolumeVerdict {
  const { total, threshold } = input;
  const remaining = Math.max(0, QSTASH_DAILY_CAP - total);
  const alert = total >= threshold;

  const quien = input.topContact
    ? ` El que más aporta hoy: ${input.topContact.label} con ${input.topContact.count}.`
    : "";

  const detail = alert
    ? `${total} eventos hoy (aviso a partir de ${threshold}, tope del plan ${QSTASH_DAILY_CAP}). Quedan ${remaining} antes de que se empiecen a perder mensajes.${quien} Si sobra volumen de un contacto, se puede ignorar desde su conversación.`
    : `${total} eventos hoy, por debajo del aviso (${threshold}).${quien}`;

  return { total, threshold, alert, remaining, detail };
}

/** Cuenta los eventos de WhatsApp de hoy (hora de Bogotá). */
export async function countTodayWebhookEvents(now = new Date()): Promise<number> {
  return prismadb.marketplaceWebhookEvent.count({
    where: { provider: MarketplaceProvider.WHATSAPP, createdAt: { gte: startOfBogotaDay(now) } },
  });
}

/**
 * Quién habla más hoy, para no tener que ir a buscarlo a mano.
 *
 * Sale de `ConversationMessage`, que está indexado, y no de rastrear los
 * payloads guardados: es una aproximación —no cuenta los eventos que aún no
 * se procesaron— pero suficiente para señalar al culpable, y cuesta una
 * consulta en vez de un escaneo de JSON.
 */
export async function findTopContactToday(
  now = new Date(),
): Promise<{ label: string; count: number } | null> {
  const desde = startOfBogotaDay(now);
  const grupos = await prismadb.conversationMessage.groupBy({
    by: ["conversationId"],
    where: { createdAt: { gte: desde } },
    _count: { _all: true },
    orderBy: { _count: { conversationId: "desc" } },
    take: 1,
  });
  const top = grupos[0];
  if (!top) return null;

  const conversation = await prismadb.conversation.findUnique({
    where: { id: top.conversationId },
    select: { contactName: true, phone: true, bsuid: true },
  });
  const label =
    conversation?.contactName?.trim() ||
    conversation?.phone ||
    conversation?.bsuid ||
    "un contacto sin nombre";
  return { label, count: top._count._all };
}

/** Medianoche de Bogotá (UTC−5, sin horario de verano) en tiempo absoluto. */
export function startOfBogotaDay(now: Date): Date {
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const midnight = Date.UTC(
    bogota.getUTCFullYear(),
    bogota.getUTCMonth(),
    bogota.getUTCDate(),
  );
  return new Date(midnight + 5 * 60 * 60 * 1000);
}
