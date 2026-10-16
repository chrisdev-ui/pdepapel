import { tool } from "ai";
import { z } from "zod";

import { withCopilotQuery, type CopilotDb } from "@/lib/copiloto/db";
import { foldText, rankCandidates } from "@/lib/copiloto/skills/product-match";
import { isLowPriceForMercadoLibre } from "@/lib/mercadolibre/listing-margin";
import { analyzeBelowMargin } from "@/lib/pricing/below-margin";
import { buildMarkupResolver, median, type MarkupCategory, type MarkupSampleProduct, type ResolvedMarkup } from "@/lib/pricing/category-markup";
import { loadMarkupInputs } from "@/lib/pricing/category-markup-db";
import { DEFAULT_PACK_STEP_PCT, packLadder, packMixes, packScenarios, recommendSizes } from "@/lib/pricing/packs";
import {
  landedCost,
  marginOnPrice,
  mercadoLibreEstimate,
  priceToReachMargin,
  suggestMercadoLibreStorePrice,
  suggestStorePrice,
  type MercadoLibreFeeSettings,
} from "@/lib/pricing/price-calculator";
import { requireStoreOwner } from "@/lib/store-access";

export const PRICE_TOOL = "calcularPrecio";
export const PACKS_TOOL = "compararPacks";
export const BELOW_MARGIN_TOOL = "margenesBajoMinimo";
export const PRICING_TOOLS = [PRICE_TOOL, PACKS_TOOL, BELOW_MARGIN_TOOL] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const SALES_DAYS = 30;
const SHIPPING_DAYS = 90;
const COMPARABLES = 5;
const PRODUCTS_PER_CATEGORY = 8;
const PRODUCT_CAP = 5000;
const PAID_STATUSES = ["PAID", "SENT"] as const;

const canal = z.enum(["tienda", "mercadolibre", "ambos"]).default("ambos").describe("Dónde se va a vender: tienda, mercadolibre o ambos");
const pesos = z.number().finite().min(0).max(100_000_000);

export const priceInput = z.object({
  costoUnitario: pesos.positive().describe("Lo que costó una unidad, en pesos (sin envío)"),
  envioPorUnidad: pesos.optional().describe("Envío y otros gastos por unidad, si Paula lo dio"),
  costoEmpaque: pesos.optional().describe("Costo del empaque por unidad vendida, si Paula lo dio"),
  preciosMercado: z.array(pesos.positive()).max(5).optional().describe("Precios de otras tiendas que Paula dio; nunca inventados"),
  subcategoria: z.string().trim().max(80).optional().describe("Subcategoría del panel, si Paula la nombró (Cuadernos, Stickers…)"),
  parecidoA: z.string().trim().max(120).optional().describe("Un producto de la tienda parecido, para comparar y para saber su subcategoría"),
  canal,
});

export const packsInput = z.object({
  costoUnitario: pesos.positive().describe("Lo que costó una unidad, en pesos"),
  disponible: z.number().int().min(1).max(100_000).describe("Unidades que tiene para armar packs"),
  tamanos: z.array(z.number().int().min(1).max(1000)).min(2).max(5).describe("Tamaños de pack a comparar (unidades por pack)"),
  preciosPorPack: z
    .array(z.object({ tamano: z.number().int().min(1), precio: pesos.positive() }))
    .max(5)
    .optional()
    .describe("Los precios que Paula ya decidió, por tamaño; los demás se sugieren"),
  costoEmpaque: pesos.optional().describe("Costo del empaque de cada pack, si Paula lo dio"),
  pasoDescuentoPct: z.number().min(0).max(20).default(DEFAULT_PACK_STEP_PCT).describe("Puntos de descuento extra por cada tamaño más grande (por defecto 5)"),
  subcategoria: z.string().trim().max(80).optional(),
  canal,
});

export const belowMarginInput = z.object({
  margenes: z
    .array(z.number().min(1).max(90))
    .max(3)
    .optional()
    .describe("Márgenes sobre el precio a revisar, en % (por ejemplo [35, 40]); sin esto, el margen mínimo de Configuración"),
  subcategoria: z.string().trim().max(80).optional().describe("Solo esta subcategoría"),
});

export interface PricingSettings extends MercadoLibreFeeSettings {
  minMarginPct: number | null;
  mercadoLibreTargetMarginPercent: number;
  mercadoLibreMinNetPerUnit: number;
  freeShippingThreshold: number | null;
}

export async function loadPricingSettings(db: CopilotDb, storeId: string): Promise<PricingSettings> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: {
      storeMinMarginPercent: true,
      mercadoLibreTargetMarginPercent: true,
      mercadoLibreMinNetPerUnit: true,
      mercadoLibreLowPriceFixedFee: true,
      mercadoLibreFreeShippingMin: true,
      freeShippingThreshold: true,
    },
  });
  return {
    minMarginPct: store?.storeMinMarginPercent ?? null,
    mercadoLibreTargetMarginPercent: store?.mercadoLibreTargetMarginPercent ?? 20,
    mercadoLibreMinNetPerUnit: store?.mercadoLibreMinNetPerUnit ?? 10_000,
    lowPriceFixedFee: store?.mercadoLibreLowPriceFixedFee ?? null,
    freeShippingMin: store?.mercadoLibreFreeShippingMin ?? null,
    freeShippingThreshold: store?.freeShippingThreshold ?? null,
  };
}

/** La subcategoría que nombró Paula, sin distinguir tildes ni mayúsculas; null si no hay una sola clara. */
export function findCategory(categories: readonly MarkupCategory[], name: string | undefined): MarkupCategory | null {
  if (!name) return null;
  const wanted = foldText(name);
  const exact = categories.filter((category) => foldText(category.name) === wanted);
  if (exact.length === 1) return exact[0];
  const partial = categories.filter((category) => foldText(category.name).includes(wanted) || wanted.includes(foldText(category.name)));
  return partial.length === 1 ? partial[0] : null;
}

/** Envío típico: la mediana de lo que pagaron de envío los pedidos pagados de 90 días (sin los de envío gratis o sin envío). */
export async function typicalShipping(db: CopilotDb, storeId: string, now: Date): Promise<{ mediana: number | null; pedidos: number }> {
  const orders = await db.order.findMany({
    where: { storeId, status: { in: [...PAID_STATUSES] }, paidAt: { gte: new Date(now.getTime() - SHIPPING_DAYS * DAY_MS) } },
    select: { id: true },
  });
  if (orders.length === 0) return { mediana: null, pedidos: 0 };
  const rows = await db.shipping.findMany({ where: { orderId: { in: orders.map((order) => order.id) }, cost: { gt: 0 } }, select: { cost: true } });
  const costs = rows.map((row) => row.cost ?? 0).filter((cost) => cost > 0);
  const value = median(costs);
  return { mediana: value === null ? null : Math.round(value), pedidos: costs.length };
}

interface CatalogProduct extends MarkupSampleProduct {
  id: string;
  name: string;
  sku: string | null;
}

async function loadCatalog(db: CopilotDb, storeId: string) {
  const [{ categories }, products] = await Promise.all([
    loadMarkupInputs(db, storeId),
    db.product.findMany({
      where: { storeId, isArchived: false },
      select: { id: true, name: true, sku: true, categoryId: true, price: true, acqPrice: true, transportationCost: true, isKit: true },
      take: PRODUCT_CAP,
    }),
  ]);
  return { categories, products: products as CatalogProduct[], truncated: products.length >= PRODUCT_CAP };
}

async function soldLast30(db: CopilotDb, storeId: string, productIds: string[], now: Date) {
  if (productIds.length === 0) return new Map<string, number>();
  const orders = await db.order.findMany({
    where: { storeId, status: { in: [...PAID_STATUSES] }, paidAt: { gte: new Date(now.getTime() - SALES_DAYS * DAY_MS) } },
    select: { id: true },
  });
  if (orders.length === 0) return new Map<string, number>();
  const items = await db.orderItem.findMany({
    where: { orderId: { in: orders.map((order) => order.id) }, productId: { in: productIds } },
    select: { productId: true, quantity: true },
  });
  const sold = new Map<string, number>();
  for (const item of items) if (item.productId) sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.quantity);
  return sold;
}

const markupOut = (markup: ResolvedMarkup) => ({ aumentoPct: markup.markupPct, fuente: markup.source });

/** Todo el cálculo de `calcularPrecio`, sin la sesión: lo usan la herramienta y las pruebas con `copilot_ro`. */
export async function computePrice(db: CopilotDb, storeId: string, rawInput: z.input<typeof priceInput>, now = new Date()) {
  const input = priceInput.parse(rawInput);
  const [settings, catalog] = await Promise.all([loadPricingSettings(db, storeId), loadCatalog(db, storeId)]);
  const resolve = buildMarkupResolver(catalog.products, catalog.categories);
  const categoryNames = new Map(catalog.categories.map((category) => [category.id, category.name]));

  const named = findCategory(catalog.categories, input.subcategoria);
  const candidates = catalog.products
    .filter((product) => !product.isKit)
    .map((product) => ({ ...product, category: product.categoryId ? categoryNames.get(product.categoryId) ?? null : null, group: null }));
  const similar = input.parecidoA ? rankCandidates(input.parecidoA, candidates).slice(0, COMPARABLES).map((row) => row.product as (typeof candidates)[number]) : [];
  const categoryId = named?.id ?? similar[0]?.categoryId ?? null;
  const markup = resolve(categoryId);

  const unitCost = input.costoUnitario + (input.envioPorUnidad ?? 0) + (input.costoEmpaque ?? 0);
  const storePrice = suggestStorePrice(unitCost, markup.markupPct);
  const minimum = settings.minMarginPct === null ? null : priceToReachMargin(unitCost, settings.minMarginPct);
  const comparableRows = similar.length ? similar : categoryId ? candidates.filter((product) => product.categoryId === categoryId).slice(0, COMPARABLES) : [];
  const sold = await soldLast30(db, storeId, comparableRows.map((product) => product.id), now);
  const mlPrice = input.canal === "tienda" ? null : suggestMercadoLibreStorePrice(unitCost, { targetMarginPercent: settings.mercadoLibreTargetMarginPercent, minNetPerUnit: settings.mercadoLibreMinNetPerUnit });
  const market = input.preciosMercado?.length ? [...input.preciosMercado].sort((a, b) => a - b) : null;

  return {
    fuente: PRICE_TOOL,
    datos: {
      entradas: {
        costoUnitario: input.costoUnitario,
        envioPorUnidad: input.envioPorUnidad ?? null,
        costoEmpaque: input.costoEmpaque ?? null,
        costoTotal: unitCost,
        subcategoria: categoryId ? categoryNames.get(categoryId) ?? null : null,
        subcategoriaPedidaSinCoincidencia: Boolean(input.subcategoria && !named),
      },
      canal: input.canal,
      tienda:
        input.canal === "mercadolibre"
          ? null
          : {
              precioSugerido: storePrice,
              ...markupOut(markup),
              margenPct: marginOnPrice(storePrice, unitCost),
              ganancia: storePrice - unitCost,
              minimo: settings.minMarginPct === null ? null : { margenPct: settings.minMarginPct, precio: minimum },
            },
      mercadolibre:
        input.canal === "tienda"
          ? null
          : {
              precioSugerido: mlPrice,
              estimado: mlPrice === null ? null : mercadoLibreEstimate(mlPrice, unitCost, settings),
              metas: { margenPct: settings.mercadoLibreTargetMarginPercent, gananciaMinima: settings.mercadoLibreMinNetPerUnit },
              muyPorEncimaDeLaTienda: mlPrice !== null && storePrice > 0 && isLowPriceForMercadoLibre(mlPrice, storePrice),
            },
      mercado: market
        ? {
            minimo: market[0],
            maximo: market[market.length - 1],
            posicion: storePrice < market[0] ? "debajo" : storePrice > market[market.length - 1] ? "encima" : "dentro",
          }
        : null,
      parecidos: comparableRows.map((product) => {
        const cost = landedCost(product.acqPrice, product.transportationCost);
        return { nombre: product.name, precio: product.price, margenPct: cost === null ? null : marginOnPrice(product.price, cost), vendidas30Dias: sold.get(product.id) ?? 0 };
      }),
      parecidosPor: similar.length ? "nombre" : categoryId ? "subcategoria" : null,
    },
  };
}

/** Todo el cálculo de `compararPacks`. */
export async function computePacks(db: CopilotDb, storeId: string, rawInput: z.input<typeof packsInput>, now = new Date()) {
  const input = packsInput.parse(rawInput);
  const [settings, catalog, shipping] = await Promise.all([loadPricingSettings(db, storeId), loadCatalog(db, storeId), typicalShipping(db, storeId, now)]);
  const sizes = Array.from(new Set(input.tamanos)).sort((a, b) => a - b);
  const given = Object.fromEntries((input.preciosPorPack ?? []).filter((row) => sizes.includes(row.tamano)).map((row) => [row.tamano, row.precio]));
  const category = findCategory(catalog.categories, input.subcategoria);
  const markup = buildMarkupResolver(catalog.products, catalog.categories)(category?.id ?? null);
  // Sin ningún precio de Paula, el más pequeño sale del aumento sugerido (con el empaque dentro del costo).
  const base = Object.keys(given).length ? null : sizes[0];
  if (base !== null) given[base] = suggestStorePrice(base * input.costoUnitario + (input.costoEmpaque ?? 0), markup.markupPct);
  const prices = packLadder({ sizes, given, stepPct: input.pasoDescuentoPct });
  const scenarios = packScenarios({ prices, unitCost: input.costoUnitario, packaging: input.costoEmpaque ?? null, available: input.disponible });
  const recommended = recommendSizes(scenarios);
  const floorNet = (price: number) => Math.max(settings.mercadoLibreMinNetPerUnit, (settings.mercadoLibreTargetMarginPercent / 100) * price);

  return {
    fuente: PACKS_TOOL,
    datos: {
      entradas: {
        costoUnitario: input.costoUnitario,
        disponible: input.disponible,
        costoEmpaque: input.costoEmpaque ?? null,
        pasoDescuentoPct: input.pasoDescuentoPct,
        precioBase: base === null ? null : { tamano: base, ...markupOut(markup) },
      },
      tamanos: scenarios.map((scenario) => {
        const ml = input.canal === "tienda" ? null : mercadoLibreEstimate(scenario.price, scenario.packCost, settings);
        return {
          ...scenario,
          sugerido: scenario.fromLadder,
          minimoTienda: settings.minMarginPct === null ? null : { margenPct: settings.minMarginPct, debajo: scenario.profitPct < settings.minMarginPct },
          complemento: shipping.mediana !== null && scenario.price < shipping.mediana,
          packsParaEnvioGratis: settings.freeShippingThreshold ? Math.ceil(settings.freeShippingThreshold / scenario.price) : null,
          mercadolibre: ml ? { ...ml, debajoDelPiso: ml.net === null || ml.net < floorNet(scenario.price) } : null,
        };
      }),
      recomendados: recommended,
      pocosPacks: scenarios.some((scenario) => scenario.packs < 8),
      mezclas: packMixes(scenarios, recommended, input.disponible),
      envioTipico: shipping,
      envioGratisDesde: settings.freeShippingThreshold,
      canal: input.canal,
    },
  };
}

/** Todo el cálculo de `margenesBajoMinimo`. */
export async function computeBelowMargin(db: CopilotDb, storeId: string, rawInput: z.input<typeof belowMarginInput>) {
  const input = belowMarginInput.parse(rawInput);
  const [settings, catalog] = await Promise.all([loadPricingSettings(db, storeId), loadCatalog(db, storeId)]);
  const thresholds = input.margenes?.length ? input.margenes : settings.minMarginPct === null ? [] : [settings.minMarginPct];
  if (thresholds.length === 0) {
    return { fuente: BELOW_MARGIN_TOOL, datos: { sinMargen: true as const, minimoConfigurado: null } };
  }
  const category = findCategory(catalog.categories, input.subcategoria);
  const names = new Map(catalog.categories.map((row) => [row.id, row.name]));
  const scoped = category ? catalog.products.filter((product) => product.categoryId === category.id) : catalog.products;
  const analysis = analyzeBelowMargin(
    scoped.map((product) => ({ ...product, categoryName: product.categoryId ? names.get(product.categoryId) ?? null : null })),
    thresholds,
  );
  return {
    fuente: BELOW_MARGIN_TOOL,
    datos: {
      sinMargen: false as const,
      minimoConfigurado: settings.minMarginPct,
      subcategoria: category?.name ?? null,
      subcategoriaPedidaSinCoincidencia: Boolean(input.subcategoria && !category),
      evaluados: analysis.evaluados,
      sinCosto: analysis.sinCosto,
      kits: analysis.kits,
      truncado: catalog.truncated,
      porUmbral: analysis.porUmbral.map((threshold) => ({
        ...threshold,
        categorias: threshold.categorias.map((row) => ({ ...row, productos: row.productos.slice(0, PRODUCTS_PER_CATEGORY), masProductos: Math.max(0, row.productos.length - PRODUCTS_PER_CATEGORY) })),
      })),
    },
  };
}

export type PriceResult = Awaited<ReturnType<typeof computePrice>>;
export type PacksResult = Awaited<ReturnType<typeof computePacks>>;
export type BelowMarginResult = Awaited<ReturnType<typeof computeBelowMargin>>;

export function calcularPrecioTool(storeId: string) {
  return tool({
    description:
      "Precio sugerido de un producto para la tienda y Mercado Libre a partir de su costo: aumento de su subcategoría (mediana o el definido por Paula), margen, mínimo de la tienda, estimado de Mercado Libre, posición frente a los precios de mercado que dio Paula y productos parecidos de la tienda. Todo calculado en código; solo lectura.",
    inputSchema: priceInput,
    execute: async (input) => {
      await requireStoreOwner(storeId);
      return withCopilotQuery((db) => computePrice(db, storeId, input));
    },
  });
}

export function compararPacksTool(storeId: string) {
  return tool({
    description:
      "Compara tamaños de pack de un mismo producto: precio de cada tamaño (los de Paula o sugeridos con descuento por tamaño), ganancia, cuántos packs alcanzan con el stock, mezclas que usan todo el stock, recomendación, envío típico y estimado de Mercado Libre. Todo calculado en código; solo lectura.",
    inputSchema: packsInput,
    execute: async (input) => {
      await requireStoreOwner(storeId);
      return withCopilotQuery((db) => computePacks(db, storeId, input));
    },
  });
}

export function margenesBajoMinimoTool(storeId: string) {
  return tool({
    description:
      "Productos activos cuyo margen sobre el precio (costo con envío) queda por debajo de uno o varios porcentajes, por subcategoría, con el precio al peso que tendrían que tener para llegar. Sirve para decidir el margen mínimo. Todo calculado en código; solo lectura.",
    inputSchema: belowMarginInput,
    execute: async (input) => {
      await requireStoreOwner(storeId);
      return withCopilotQuery((db) => computeBelowMargin(db, storeId, input));
    },
  });
}
