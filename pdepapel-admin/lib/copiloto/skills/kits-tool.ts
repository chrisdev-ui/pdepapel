import { Prisma } from "@prisma/client";
import { tool } from "ai";
import { z } from "zod";

import { withCopilotQuery, type CopilotDb } from "@/lib/copiloto/db";
import { coPurchaseCounts, proposeKits, risingProducts, type KitProduct, type KitSignals } from "@/lib/copiloto/kits-rotation";
import { effectiveUnitPrice, pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";
import { DEFAULT_SLOW_DAYS, loadSalesHistory, unitCostOf, type SalesHistory } from "@/lib/sales-velocity";
import { foldWords, upcomingOccasions } from "@/lib/season-calendar";
import { requireStoreOwner } from "@/lib/store-access";

const DAY_MS = 24 * 60 * 60 * 1000;
const CO_PURCHASE_DAYS = 180;
const DEMAND_DAYS = 30;
/** Una palabra o un producto pedido una sola vez no es señal: puede ser una sola clienta. */
export const MIN_DEMAND_REPEATS = 2;
const PRODUCT_CAP = 3000;
const SHOWN_SLOW = 15;

export const kitsInput = z.object({
  dias: z.number().int().min(30).max(365).default(DEFAULT_SLOW_DAYS).describe("Días sin venderse para considerar un producto lento (por defecto 90)"),
  kits: z.number().int().min(1).max(5).default(3).describe("Cuántos kits proponer"),
  minimoPorKit: z.number().int().min(1).max(50).default(3).describe("Kits que se deben poder armar como mínimo con el disponible"),
  margenMinimo: z.number().min(0).max(80).default(20).describe("Margen mínimo sobre el costo total, en %"),
});

interface DemandRow {
  productType: string | null;
  characterName: string | null;
  found: bigint | number | null;
  shownProductIds: unknown;
}

/** MySQL devuelve el `null` de JSON como el texto «null» al desenvolverlo. */
const cleanTerm = (value: string | null) => {
  if (value === null || value.trim().toLowerCase() === "null") return null;
  const term = foldWords(value ?? "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
  return term.length >= 3 && term.length <= 40 ? term : null;
};

/**
 * Lo que pidieron por WhatsApp en 30 días, solo como cuentas. Viene de la
 * vista `CopilotBotDemand` (tipo de producto y personaje que entendió el bot,
 * cuántos productos encontró y cuáles enseñó); nunca texto del mensaje ni
 * teléfonos. Lo que aparece una sola vez se descarta.
 */
export function summarizeDemand(rows: readonly DemandRow[]) {
  const terms = new Map<string, { veces: number; sinResultados: number }>();
  const shown = new Map<string, number>();
  for (const row of rows) {
    const empty = Number(row.found ?? -1) === 0;
    for (const term of Array.from(new Set([cleanTerm(row.productType), cleanTerm(row.characterName)]))) {
      if (!term) continue;
      const entry = terms.get(term) ?? { veces: 0, sinResultados: 0 };
      entry.veces += 1;
      if (empty) entry.sinResultados += 1;
      terms.set(term, entry);
    }
    const ids = typeof row.shownProductIds === "string" ? safeJson(row.shownProductIds) : row.shownProductIds;
    if (Array.isArray(ids)) for (const id of Array.from(new Set(ids.filter((value): value is string => typeof value === "string")))) shown.set(id, (shown.get(id) ?? 0) + 1);
  }
  return {
    terms: Array.from(terms, ([termino, value]) => ({ termino, ...value }))
      .filter((row) => row.veces >= MIN_DEMAND_REPEATS)
      .sort((a, b) => b.veces - a.veces || a.termino.localeCompare(b.termino)),
    shown: new Map(Array.from(shown).filter(([, veces]) => veces >= MIN_DEMAND_REPEATS)),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loadDemand(storeId: string, now: Date, run: typeof withCopilotQuery = withCopilotQuery) {
  try {
    const rows = await run((db) =>
      db.$queryRaw<DemandRow[]>(Prisma.sql`
        SELECT productType, characterName, found, shownProductIds
          FROM CopilotBotDemand
         WHERE storeId = ${storeId} AND createdAt >= ${new Date(now.getTime() - DEMAND_DAYS * DAY_MS)}`),
    );
    return { available: true, ...summarizeDemand(rows) };
  } catch {
    return { available: false, terms: [] as ReturnType<typeof summarizeDemand>["terms"], shown: new Map<string, number>() };
  }
}

export async function loadKitData(db: CopilotDb, storeId: string, days: number, now = new Date()) {
  const [rows, history, offers, tiers] = await Promise.all([
    db.product.findMany({
      where: { storeId, isArchived: false },
      select: {
        id: true,
        name: true,
        categoryId: true,
        productGroupId: true,
        isKit: true,
        isArchived: true,
        stock: true,
        reservedUnits: true,
        createdAt: true,
        acqPrice: true,
        transportationCost: true,
        price: true,
        category: { select: { name: true, typeId: true, type: { select: { name: true } } } },
      },
      take: PRODUCT_CAP,
    }),
    loadSalesHistory(db, storeId, { days, now }),
    db.offer.findMany({
      where: { storeId, isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        label: true,
        type: true,
        amount: true,
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
        productGroups: { select: { productGroupId: true } },
      },
    }),
    db.productPriceTier.findMany({ where: { storeId }, select: { productId: true, minQuantity: true, unitPrice: true } }),
  ]);

  const tiersByProduct = new Map<string, { minQuantity: number; unitPrice: number }[]>();
  for (const tier of tiers) tiersByProduct.set(tier.productId, [...(tiersByProduct.get(tier.productId) ?? []), { minQuantity: tier.minQuantity, unitPrice: tier.unitPrice }]);

  const products: KitProduct[] = rows.map((row) => {
    const priced = { id: row.id, price: row.price, categoryId: row.categoryId, productGroupId: row.productGroupId };
    const offer = pickBestOffer(priced, offers as ActiveOffer[]);
    const resolved = effectiveUnitPrice({ product: priced, offer, tiers: tiersByProduct.get(row.id) ?? [], quantity: 1 });
    return {
      id: row.id,
      name: row.name.trim(),
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      typeId: row.category?.typeId ?? null,
      typeName: row.category?.type?.name ?? null,
      isKit: row.isKit,
      isArchived: row.isArchived,
      stock: row.stock,
      reservedUnits: row.reservedUnits,
      createdAt: row.createdAt,
      unitCost: unitCostOf(row),
      listPrice: row.price,
      effectivePrice: resolved.unitPrice,
      offerLabel: resolved.source === "offer" ? resolved.offerLabel : null,
    };
  });

  return { products, history, truncated: rows.length >= PRODUCT_CAP || history.truncated };
}

/** Las señales que no son ventas; la demanda por WhatsApp va en su propia consulta para que, si falla, lo demás siga. */
export function buildKitSignals(products: readonly KitProduct[], history: SalesHistory, demand: Awaited<ReturnType<typeof loadDemand>>, now: Date): KitSignals {
  return {
    rising: risingProducts(products.filter((product) => !product.isKit), history),
    shownOnWhatsApp: demand.shown,
    whatsAppTerms: demand.terms,
    occasions: upcomingOccasions(now, 45),
  };
}

const ago = (days: number | null) => (days === null ? "más de un año" : `hace ${days} días`);

export function kitsParaRotarTool(storeId: string) {
  return tool({
    description:
      "Productos lentos (con disponible y sin ventas en N días, contando lo vendido dentro de kits) ordenados por plata quieta a costo, y borradores de kits que los juntan con piezas que sí se venden, con precio sugerido sobre precios efectivos (con ofertas), margen y las señales que los respaldan (en alza, WhatsApp, temporada). Todo calculado en código; solo lectura.",
    inputSchema: kitsInput,
    execute: async (input) => {
      await requireStoreOwner(storeId);
      const { dias, kits, minimoPorKit, margenMinimo } = kitsInput.parse(input);
      const now = new Date();
      const data = await withCopilotQuery((db) => loadKitData(db, storeId, dias, now));
      const demand = await loadDemand(storeId, now);
      const signals = buildKitSignals(data.products, data.history, demand, now);
      const together = coPurchaseCounts(data.history.ordersSince(CO_PURCHASE_DAYS)).together;
      const result = proposeKits({ products: data.products, history: data.history, together, signals, options: { days: dias, kits, minPerKit: minimoPorKit, minMarginPct: margenMinimo } });
      const byId = new Map(data.products.map((product) => [product.id, product]));
      const tiedTotal = result.lentos.reduce((total, row) => total + (row.tiedUpAtCost ?? 0), 0);
      return {
        fuente: "kitsParaRotar",
        rango: `últimos ${dias} días`,
        actualizadoEl: now.toISOString(),
        truncado: data.truncated,
        datos: {
          criterios: {
            diasSinVenta: dias,
            minimoPorKit,
            margenMinimoPct: margenMinimo,
            precios: "efectivos: lista, oferta vigente y precio por cantidad, como en la tienda",
            costo: "compra más transporte, como en detalleProducto",
          },
          totalLentos: result.lentos.length,
          plataQuietaACostoTotal: tiedTotal,
          lentosSinCosto: result.lentos.filter((row) => row.unitCost === null).length,
          lentos: result.lentos.slice(0, SHOWN_SLOW).map((row) => ({
            nombre: row.name,
            disponible: row.available,
            reservados: byId.get(row.id)?.reservedUnits ?? 0,
            costoUnitario: row.unitCost,
            plataQuietaACosto: row.tiedUpAtCost,
            ultimaVenta: ago(row.daysSinceLastSale),
          })),
          kits: result.kits,
          sinKit: result.sinKit.slice(0, 5),
          señales: {
            enAlza: Array.from(signals.rising)
              .sort((a, b) => b[1].sold30 - a[1].sold30)
              .slice(0, 5)
              .map(([id, value]) => ({ nombre: byId.get(id)?.name ?? id, unidades30Dias: value.sold30, unidades30DiasAnteriores: value.previous30 })),
            whatsapp: !demand.available
              ? { estado: "no disponible" }
              : signals.whatsAppTerms.length === 0 && signals.shownOnWhatsApp.size === 0
                ? { estado: `sin datos suficientes: nada se repitió ${MIN_DEMAND_REPEATS} o más veces en ${DEMAND_DAYS} días` }
                : {
                    estado: "ok",
                    terminosPedidos: signals.whatsAppTerms.slice(0, 8),
                    productosEnseñados: Array.from(signals.shownOnWhatsApp)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([id, veces]) => ({ nombre: byId.get(id)?.name ?? "producto ya no disponible", veces })),
                  },
            temporada: signals.occasions.map((occasion) => ({ nombre: occasion.nombre, fecha: occasion.fecha, enDias: occasion.enDias })),
            busquedasTienda: "no disponible: la tienda no guarda lo que buscan las clientas",
          },
        },
      };
    },
  });
}
