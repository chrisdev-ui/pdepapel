import prismadb from "@/lib/prismadb";

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
  | "storefront-revalidation";

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

export async function getSystemsStatus(
  storeId: string,
  now = new Date(),
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
  return buildSystemsStatus(runs, storeId, now);
}
