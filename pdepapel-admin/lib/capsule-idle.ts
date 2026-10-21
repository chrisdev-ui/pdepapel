import prismadb from "@/lib/prismadb";
import { DEFAULT_SLOW_DAYS, loadFirstStockedAt, loadSalesHistory, rankSlowMovers, stockedSinceOf, unitCostOf } from "@/lib/sales-velocity";

/**
 * Los productos quietos de la tienda con la regla del Copiloto
 * (`rankSlowMovers`, ventana de `DEFAULT_SLOW_DAYS`): la base de los papeles
 * y de las ediciones sugeridas. El cálculo lee hasta un año de ventas, así
 * que se guarda unos minutos en Redis; sin Redis se calcula cada vez.
 * Solo guarda qué está quieto y desde cuándo; disponible y costo se leen en
 * vivo en cada consulta.
 */
export interface IdleInfo {
  /** Días desde la última venta; null si no se vendió en el último año. */
  daysSinceLastSale: number | null;
  /** Días que lleva en inventario (primera entrada o creación). */
  daysInStock: number;
}

export const CAPSULE_IDLE_CACHE_SECONDS = 600;
const cacheKey = (storeId: string) => `store:${storeId}:capsule-idle:v1`;
const DAY_MS = 86_400_000;

type CacheClient = { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown, options: { ex: number }) => Promise<unknown> };

async function cacheClient(): Promise<CacheClient | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    return Redis.fromEnv({ retry: { retries: 0 }, signal: AbortSignal.timeout(1500) });
  } catch {
    return null;
  }
}

export async function computeIdleProducts(storeId: string, now = new Date()): Promise<Map<string, IdleInfo>> {
  const [products, history, firstStocked] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, isArchived: false, isKit: false, capsuleEdition: { is: null } },
      select: { id: true, name: true, stock: true, reservedUnits: true, isKit: true, isArchived: true, createdAt: true, acqPrice: true, transportationCost: true },
    }),
    loadSalesHistory(prismadb, storeId, { days: DEFAULT_SLOW_DAYS, now }),
    loadFirstStockedAt(prismadb, storeId),
  ]);
  const stockedSince = new Map(products.map((product) => [product.id, stockedSinceOf(firstStocked, product)]));
  const slow = rankSlowMovers(
    products.map((product) => ({ ...product, stockedSince: stockedSince.get(product.id)!, unitCost: unitCostOf(product) })),
    history,
  );
  return new Map(
    slow.map((row) => [row.id, { daysSinceLastSale: row.daysSinceLastSale, daysInStock: Math.floor((now.getTime() - stockedSince.get(row.id)!.getTime()) / DAY_MS) }]),
  );
}

export async function loadIdleProducts(storeId: string): Promise<Map<string, IdleInfo>> {
  const redis = await cacheClient();
  if (redis) {
    try {
      const cached = (await redis.get(cacheKey(storeId))) as [string, IdleInfo][] | null;
      if (Array.isArray(cached)) return new Map(cached);
    } catch {
      // Sin caché: se calcula.
    }
  }
  const idle = await computeIdleProducts(storeId);
  if (redis) {
    try {
      await redis.set(cacheKey(storeId), Array.from(idle.entries()), { ex: CAPSULE_IDLE_CACHE_SECONDS });
    } catch {
      // La próxima consulta lo vuelve a calcular.
    }
  }
  return idle;
}

/** «120 días sin venta» / «Sin ventas en el último año». */
export function idleReason(info: IdleInfo): string {
  return info.daysSinceLastSale === null ? "Sin ventas en el último año" : `${info.daysSinceLastSale} días sin venta`;
}
