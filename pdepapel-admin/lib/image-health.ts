import prismadb from "@/lib/prismadb";

export type ImageHealth = "ok" | "broken" | "unknown";

type FetchLike = (input: string, init?: { method?: string; signal?: AbortSignal; redirect?: "follow" }) => Promise<{ status: number; ok: boolean }>;

const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 8;

/**
 * Comprueba si la URL de una imagen sigue existiendo. Solo 404 y 410 cuentan
 * como rota: un error de red o un 5xx es un problema momentáneo, no un
 * archivo borrado, y no debe marcar nada.
 */
export async function checkImageUrl(url: string, fetchImpl: FetchLike = fetch): Promise<ImageHealth> {
  if (!/^https?:\/\//.test(url)) return "broken";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response = await fetchImpl(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    if (response.status === 405 || response.status === 403) {
      response = await fetchImpl(url, { method: "GET", signal: controller.signal, redirect: "follow" });
    }
    if (response.status === 404 || response.status === 410) return "broken";
    if (response.ok) return "ok";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

export interface ImageHealthReport {
  checked: number;
  broken: number;
  repaired: number;
  unknown: number;
}

/**
 * Revisa las imágenes de los productos y grupos activos de una tienda y
 * actualiza `Image.brokenAt`: se marca cuando el archivo ya no existe y se
 * limpia cuando vuelve a existir. Pensado para el cron diario.
 */
export async function refreshImageHealth(
  storeId: string,
  options: { fetchImpl?: FetchLike; concurrency?: number } = {},
): Promise<ImageHealthReport> {
  const images = await prismadb.image.findMany({
    where: {
      OR: [
        { product: { storeId, isArchived: false } },
        { productGroup: { storeId } },
      ],
    },
    select: { id: true, url: true, brokenAt: true },
  });

  const report: ImageHealthReport = { checked: images.length, broken: 0, repaired: 0, unknown: 0 };
  const now = new Date();
  const results = await mapWithConcurrency(images, options.concurrency ?? DEFAULT_CONCURRENCY, async (image) => ({
    image,
    health: await checkImageUrl(image.url, options.fetchImpl),
  }));

  const toBreak = results.filter((r) => r.health === "broken" && !r.image.brokenAt).map((r) => r.image.id);
  const toRepair = results.filter((r) => r.health === "ok" && r.image.brokenAt).map((r) => r.image.id);
  report.broken = results.filter((r) => r.health === "broken").length;
  report.repaired = toRepair.length;
  report.unknown = results.filter((r) => r.health === "unknown").length;

  if (toBreak.length > 0) await prismadb.image.updateMany({ where: { id: { in: toBreak } }, data: { brokenAt: now } });
  if (toRepair.length > 0) await prismadb.image.updateMany({ where: { id: { in: toRepair } }, data: { brokenAt: null } });

  return report;
}

/** Productos activos con al menos una imagen rota (para el Inicio y la lista). */
export async function countProductsWithBrokenImages(storeId: string): Promise<number> {
  return prismadb.product.count({
    where: { storeId, isArchived: false, images: { some: { brokenAt: { not: null } } } },
  });
}
