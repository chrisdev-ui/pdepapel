import { ConversationMessageDirection, ConversationMessageSentBy } from "@prisma/client";
import prismadb from "@/lib/prismadb";
import { shortMemo } from "@/lib/short-memo";
import { requireStoreRead } from "@/lib/store-access";

/**
 * Última corrida de cada tarea de fondo. Una fila por (nombre, tienda) que se
 * sobreescribe en cada ejecución: no es un historial, es el "¿cuándo pasó
 * esto por última vez y cómo le fue?" que Inicio muestra en «Sistemas».
 * Registrar nunca debe tumbar la tarea: los errores se tragan con un log.
 */
export type JobName =
  | "update-coupons"
  | "update-offers"
  | "mercadolibre-health"
  | "google-merchant-feed"
  | "image-health"
  | "storefront-revalidation"
  | "whatsapp-webhook-retention"
  | "whatsapp-webhook-volume"
  | "payment-webhook-retention"
  | "notification-retry"
  | "db-health"
  | "abc-classification"
  | "bank-transfer-review"
  // Cifra, no tarea: ver `measureWhatsAppBotRatio`.
  | "whatsapp-bot-ratio"
  // Apagado (lib/scheduled-jobs.ts): entra a JOB_DEFINITIONS al encenderlo,
  // si no «Sistemas» lo marcaría atrasado.
  | "customer-reactivation";

export interface JobDefinition {
  name: JobName;
  label: string;
  /** Cada cuánto debería correr; pasado el doble sin corrida, se marca atrasada. */
  expectedEveryHours: number;
  /** Se registra por tienda (true) o una sola vez para toda la instalación. */
  perStore: boolean;
}

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    name: "storefront-revalidation",
    label: "Actualización de la tienda",
    expectedEveryHours: 24 * 7,
    perStore: false,
  },
  {
    name: "mercadolibre-health",
    label: "Revisión de Mercado Libre",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "google-merchant-feed",
    label: "Feed de Google Merchant",
    expectedEveryHours: 24,
    perStore: true,
  },
  {
    name: "image-health",
    label: "Revisión de imágenes",
    expectedEveryHours: 24,
    perStore: true,
  },
  {
    name: "whatsapp-webhook-retention",
    label: "Retención de eventos de WhatsApp",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "whatsapp-webhook-volume",
    label: "Volumen de eventos de WhatsApp",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "payment-webhook-retention",
    label: "Retención de eventos de pago",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "notification-retry",
    label: "Reenvío de correos de pedidos",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "db-health",
    label: "Salud de la base de datos",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "abc-classification",
    label: "Clasificación ABC de productos",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "bank-transfer-review",
    label: "Revisión de transferencias sin pagar",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "update-offers",
    label: "Ofertas programadas",
    expectedEveryHours: 24,
    perStore: false,
  },
  {
    name: "update-coupons",
    label: "Cupones programados",
    expectedEveryHours: 24,
    perStore: false,
  },
];

export async function recordJobRun(
  name: JobName,
  result: {
    ok: boolean;
    detail?: string | null;
    storeId?: string | null;
    ranAt?: Date;
  },
): Promise<void> {
  const ranAt = result.ranAt ?? new Date();
  const detail = result.detail ? String(result.detail).slice(0, 2000) : null;
  const storeId = result.storeId ?? null;
  try {
    // `storeId` puede ser null y MySQL no lo cubre con el índice único, así
    // que la fila global se busca a mano antes de escribir.
    const existing = await prismadb.jobRun.findFirst({
      where: { name, storeId },
      select: { id: true },
    });
    if (existing) {
      await prismadb.jobRun.update({
        where: { id: existing.id },
        data: { ranAt, ok: result.ok, detail },
      });
    } else {
      await prismadb.jobRun.create({
        data: { name, storeId, ranAt, ok: result.ok, detail },
      });
    }
  } catch (error) {
    console.warn(
      `[JOB_RUN] No se pudo registrar la corrida de ${name}:`,
      error,
    );
  }
}

export interface SystemStatusRow {
  name: JobName;
  label: string;
  ranAt: Date | null;
  ok: boolean | null;
  detail: string | null;
  /** Nunca corrió, o lleva más del doble de su cadencia sin correr. */
  overdue: boolean;
  /** Falló la última vez o está atrasada. */
  attention: boolean;
  /** Una cifra medida ahora, no una tarea: se enseña `detail` en vez de «Corrió…». */
  metric?: boolean;
}

/** Estado de cada tarea para una tienda (puro sobre filas ya cargadas, testeable). */
export function buildSystemsStatus(
  runs: {
    name: string;
    storeId: string | null;
    ranAt: Date;
    ok: boolean;
    detail: string | null;
  }[],
  storeId: string,
  now = new Date(),
): SystemStatusRow[] {
  return JOB_DEFINITIONS.map((job) => {
    const run = runs.find(
      (candidate) =>
        candidate.name === job.name &&
        (job.perStore
          ? candidate.storeId === storeId
          : candidate.storeId === null),
    );
    const overdue =
      !run ||
      now.getTime() - run.ranAt.getTime() >
        job.expectedEveryHours * 2 * 60 * 60 * 1000;
    return {
      name: job.name,
      label: job.label,
      ranAt: run?.ranAt ?? null,
      ok: run?.ok ?? null,
      detail: run?.detail ?? null,
      overdue,
      attention: overdue || run?.ok === false,
    };
  });
}

/**
 * El estado de los trabajos automáticos que enseña Inicio.
 *
 * Se reutiliza durante un minuto **sin marca de agua**, y es el único sitio
 * donde eso es correcto: son tareas que corren una vez al día, así que un
 * minuto de retraso no le miente a nadie. Con un `now` explícito (pruebas) no
 * se memoriza, porque el estado depende de él.
 */
export async function getSystemsStatus(
  storeId: string,
  now?: Date,
): Promise<SystemStatusRow[]> {
  await requireStoreRead(storeId);
  if (now) return loadSystemsStatus(storeId, now);
  return shortMemo({
    key: `sistemas:${storeId}`,
    build: () => loadSystemsStatus(storeId, new Date()),
  });
}

async function loadSystemsStatus(
  storeId: string,
  now: Date,
): Promise<SystemStatusRow[]> {
  const runs = await prismadb.jobRun
    .findMany({
      where: { OR: [{ storeId }, { storeId: null }] },
      select: {
        name: true,
        storeId: true,
        ranAt: true,
        ok: true,
        detail: true,
      },
    })
    .catch(() => []);
  const rows = buildSystemsStatus(runs, storeId, now);
  const ratio = await measureWhatsAppBotRatio(storeId, now).catch(() => null);
  return ratio ? [...rows, ratio] : rows;
}

/** Más mensajes del bot que esto por cada mensaje de clienta, en 24 h, es rojo. */
export const WHATSAPP_BOT_RATIO_LIMIT = 0.5;

/**
 * Mensajes del bot por cada mensaje de clienta en las últimas 24 h (incidente
 * del 2026-10-10: pasó de 0,08 a 1,08). Con pocos mensajes la cifra salta:
 * una clienta y una respuesta ya es 1,0.
 */
export async function measureWhatsAppBotRatio(storeId: string, now: Date): Promise<SystemStatusRow> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const base = { conversation: { storeId }, createdAt: { gte: since } };
  const [inbound, bot] = await Promise.all([
    prismadb.conversationMessage.count({
      where: { ...base, direction: ConversationMessageDirection.INBOUND, sentBy: ConversationMessageSentBy.CUSTOMER },
    }),
    prismadb.conversationMessage.count({
      where: { ...base, direction: ConversationMessageDirection.OUTBOUND, sentBy: ConversationMessageSentBy.BOT },
    }),
  ]);
  const ratio = inbound > 0 ? bot / inbound : bot > 0 ? Infinity : 0;
  const high = ratio > WHATSAPP_BOT_RATIO_LIMIT;
  const shown = Number.isFinite(ratio) ? ratio.toFixed(2).replace(".", ",") : "sin mensajes de clientas";
  return {
    name: "whatsapp-bot-ratio",
    label: "Bot de WhatsApp: mensajes por mensaje de clienta (24 h)",
    ranAt: now,
    ok: !high,
    detail: `${shown} · ${bot} del bot, ${inbound} de clientas${high ? ` · más de ${String(WHATSAPP_BOT_RATIO_LIMIT).replace(".", ",")}` : ""}`,
    overdue: false,
    attention: high,
    metric: true,
  };
}
