import { tool } from "ai";
import { z } from "zod";

import { availableStock } from "@/lib/available-stock";
import { DEFAULT_TARGET_DISCOUNT_PCT } from "@/lib/copiloto/kits-rotation";
import { withCopilotQuery, type CopilotDb } from "@/lib/copiloto/db";
import { loadEffectivePricing } from "@/lib/copiloto/skills/effective-price";
import { findGroups, findProduct, type LookupResult } from "@/lib/copiloto/skills/product-lookup";
import { KIT_PRICE_TOOL_NAME, loadPricingSettings } from "@/lib/copiloto/skills/precios-tool";
import { isKnownTransport } from "@/lib/product-costs";
import { lineUnitCost, marginAfterBold, priceKitOptions, type KitPriceLine } from "@/lib/pricing/kit-price";
import { marginOnPrice } from "@/lib/pricing/price-calculator";
import { requireStoreOwner } from "@/lib/store-access";

export const KIT_PRICE_TOOL = KIT_PRICE_TOOL_NAME;

const MAX_PIECES = 15;
const MAX_CANDIDATES = 5;

export const kitPriceInput = z
  .object({
    kit: z.string().trim().min(2).max(120).optional().describe("Nombre o SKU de un kit que ya existe en el panel"),
    piezas: z
      .array(
        z.object({
          texto: z.string().trim().min(2).max(120).describe("La pieza como la dijo Paula («libreta argollada capibara»)"),
          cantidad: z.number().int().min(1).max(50).default(1).describe("Cuántas unidades de esa pieza lleva el kit"),
        }),
      )
      .min(1)
      .max(MAX_PIECES)
      .optional()
      .describe("Las piezas de un kit armado a mano, una por producto"),
    descuentoPct: z.number().min(5).max(25).default(DEFAULT_TARGET_DISCOUNT_PCT).describe("Descuento frente a comprar las piezas por separado, en % (por defecto 12)"),
    paraRotar: z.boolean().default(false).describe("true solo si Paula dijo que el kit es para rotar o sacar mercancía quieta o inventario"),
  })
  .refine((value) => Boolean(value.kit) !== Boolean(value.piezas?.length), "Pasa el kit o sus piezas, no los dos");

const PRICING_SELECT = { price: true, acqPrice: true, transportationCost: true, stock: true, reservedUnits: true, isKit: true, categoryId: true } as const;

interface PricedRow {
  id: string;
  name: string;
  sku: string;
  price: number;
  acqPrice: number | null;
  transportationCost: number | null;
  stock: number;
  reservedUnits: number;
  isKit: boolean;
  isArchived: boolean;
  categoryId: string;
  productGroupId: string | null;
}

type Problem = "ambiguo" | "no encontrado" | "desactivado" | "es un kit";

interface Clarification {
  texto: string;
  problema: Problem;
  candidatos: { nombre: string; sku: string | null; precio: number | null; disponibles: number | null; estado: string }[];
}

const candidateRows = (result: LookupResult<PricedRow>): Clarification["candidatos"] => {
  if (result.kind === "ambiguous" || result.kind === "none") {
    return result.rows.slice(0, MAX_CANDIDATES).map((row) => ({ nombre: row.name.trim(), sku: row.sku, precio: row.price, disponibles: availableStock(row), estado: row.isArchived ? "desactivado" : "activo" }));
  }
  if (result.kind === "inactive") return result.candidates.map((row) => ({ nombre: row.nombre, sku: row.sku, precio: null, disponibles: null, estado: row.estado }));
  return [];
};

const problemOf = (result: LookupResult<PricedRow>): Problem => (result.kind === "ambiguous" ? "ambiguo" : result.kind === "inactive" ? "desactivado" : "no encontrado");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Todo el cálculo de `precioDeKit`, sin la sesión: lo usan la herramienta y las pruebas con `copilot_ro`. */
export async function computeKitPrice(
  db: CopilotDb,
  storeId: string,
  rawInput: z.input<typeof kitPriceInput>,
  options: { groups?: { id: string; name: string }[]; now?: Date } = {},
) {
  const input = kitPriceInput.parse(rawInput);
  const groups = options.groups ?? [];
  const now = options.now ?? new Date();
  const settings = await loadPricingSettings(db, storeId);
  const lookup = (texto: string) => findProduct<PricedRow>(db, storeId, { nombre: texto }, groups, { select: PRICING_SELECT, includeArchived: false });

  const resolved: { row: PricedRow; cantidad: number }[] = [];
  const aclarar: Clarification[] = [];
  let kitExistente: PricedRow | null = null;

  if (input.kit) {
    const byId = UUID.test(input.kit) ? ((await db.product.findFirst({ where: { storeId, id: input.kit, isArchived: false }, select: { ...PRICING_SELECT, id: true, name: true, sku: true, isArchived: true, productGroupId: true } })) as PricedRow | null) : null;
    const found: LookupResult<PricedRow> = byId ? { kind: "match", product: byId as never } : await lookup(input.kit);
    if (found.kind !== "match") {
      aclarar.push({ texto: input.kit, problema: problemOf(found), candidatos: candidateRows(found) });
    } else if (!found.product.isKit) {
      return { fuente: KIT_PRICE_TOOL, datos: { estado: "noEsKit" as const, producto: { nombre: found.product.name.trim(), sku: found.product.sku } } };
    } else {
      kitExistente = found.product;
      const components = await db.productKit.findMany({
        where: { kitId: found.product.id },
        select: { quantity: true, component: { select: { ...PRICING_SELECT, id: true, name: true, sku: true, isArchived: true, productGroupId: true } } },
      });
      for (const item of components) if (item.component) resolved.push({ row: item.component as PricedRow, cantidad: item.quantity });
    }
  } else {
    for (const piece of input.piezas ?? []) {
      const found = await lookup(piece.texto);
      if (found.kind === "match" && found.product.isKit) {
        aclarar.push({ texto: piece.texto, problema: "es un kit", candidatos: [{ nombre: found.product.name.trim(), sku: found.product.sku, precio: found.product.price, disponibles: availableStock(found.product), estado: "activo" }] });
      } else if (found.kind === "match") {
        const same = resolved.find((item) => item.row.id === found.product.id);
        if (same) same.cantidad += piece.cantidad;
        else resolved.push({ row: found.product, cantidad: piece.cantidad });
      } else {
        aclarar.push({ texto: piece.texto, problema: problemOf(found), candidatos: candidateRows(found) });
      }
    }
  }

  const priceOf = await loadEffectivePricing(db, storeId, now, [...resolved.map((item) => item.row.id), ...(kitExistente ? [kitExistente.id] : [])]);
  const lines: KitPriceLine[] = resolved.map(({ row, cantidad }) => {
    const effective = priceOf(row);
    return {
      productId: row.id,
      nombre: row.name.trim(),
      cantidad,
      acqPrice: row.acqPrice,
      transportationCost: row.transportationCost,
      precioEfectivo: Math.round(effective.unitPrice),
      precioDeLista: Math.round(row.price),
      stock: row.stock,
      reservedUnits: row.reservedUnits,
    };
  });
  const piezas = lines.map((line, index) => {
    const effective = priceOf(resolved[index].row);
    const unitCost = lineUnitCost(line);
    return {
      nombre: line.nombre,
      sku: resolved[index].row.sku,
      cantidad: line.cantidad,
      costoUnitario: unitCost,
      sinCosto: unitCost === null,
      transporteNoRegistrado: unitCost !== null && !isKnownTransport(line.transportationCost),
      precio: line.precioEfectivo,
      precioDeLista: line.precioDeLista,
      oferta: effective.source === "offer" ? effective.offerLabel ?? "precio rebajado" : null,
      disponibles: availableStock(line),
      desactivada: resolved[index].row.isArchived,
    };
  });

  const base = { minimoPct: settings.minMarginPct, descuentoPct: input.descuentoPct, paraRotar: input.paraRotar, piezas };
  if (aclarar.length) return { fuente: KIT_PRICE_TOOL, datos: { estado: "aclarar" as const, ...base, aclarar, piezasPedidas: input.kit ? 1 : (input.piezas ?? []).length } };
  if (!lines.length) return { fuente: KIT_PRICE_TOOL, datos: { estado: "sinPiezas" as const, ...base, kit: kitExistente ? { nombre: kitExistente.name.trim(), sku: kitExistente.sku } : null } };

  const result = priceKitOptions({ lines, minMarginPct: settings.minMarginPct, discountPct: input.descuentoPct, forRotation: input.paraRotar });
  const current = kitExistente ? Math.round(priceOf(kitExistente).unitPrice) : null;
  return {
    fuente: KIT_PRICE_TOOL,
    datos: {
      estado: "listo" as const,
      ...base,
      ...result,
      kitExistente:
        kitExistente && current !== null
          ? {
              nombre: kitExistente.name.trim(),
              sku: kitExistente.sku,
              precioActual: current,
              margenPct: result.costoTotal === null ? null : marginOnPrice(current, result.costoTotal),
              margenBoldPct: result.costoTotal === null ? null : marginAfterBold(current, result.costoTotal),
            }
          : null,
    },
  };
}

export type KitPriceToolResult = Awaited<ReturnType<typeof computeKitPrice>>;

export function precioDeKitTool(storeId: string) {
  return tool({
    description:
      "Precio de un kit con piezas que Paula elige (o de un kit que ya existe): costo y precio de cada pieza, cuántos kits alcanzan con el stock, y opciones de precio terminadas en 900 con su margen (como en la ficha y si pagan con Bold) frente al mínimo de la tienda. Si una pieza no es clara, devuelve los candidatos para preguntar. Todo calculado en código; solo lectura.",
    inputSchema: kitPriceInput,
    execute: async (input) => {
      await requireStoreOwner(storeId);
      const texts = input.kit ? [input.kit] : (input.piezas ?? []).map((piece) => piece.texto);
      const groups = await findGroups(storeId, texts.join(" "));
      return withCopilotQuery((db) => computeKitPrice(db, storeId, input, { groups }));
    },
  });
}
