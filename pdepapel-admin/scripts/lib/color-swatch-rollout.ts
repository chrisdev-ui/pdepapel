/**
 * Paso «c» del bloque D (issue #3): en UNA transacción, el backfill de
 * `Color.swatchType`, los dos hex fluorescentes que eligió Paula y la unión de
 * «Neón» en «Fluorescente».
 *
 * Todo lo que escribe se comprueba antes contra lo que se vio en el ensayo
 * del 2026-10-07: si la base ya no está como se espera (alguien cambió un
 * color, el guion ya corrió, aparecieron productos), no escribe nada. Por eso
 * una segunda corrida es siempre una negativa, nunca una segunda unión.
 *
 * La unión reutiliza `mergeAttributes`, la misma lógica de «Unir con…» del
 * panel: regla de colisión de los grupos y «Neón» archivado, no borrado.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { mergeAttributes } from "@/lib/attribute-merge";

import { COLOR_SWATCH_BACKFILL, normalizeColorName } from "./color-swatch-backfill.mjs";

type Db = PrismaClient | Prisma.TransactionClient;

export const NEON_NAME = "Neón";
export const FLUORESCENT_NAME = "Fluorescente";
export const BLUE_NAME = "Azul fluorescente";
export const PURPLE_NAME = "Morado fluorescente";

export interface RolloutExpectations {
  /** Colores de la tienda, todos en SOLID antes de empezar. */
  colorCount: number;
  blueHex: string;
  purpleHex: string;
  /** Productos (activos y archivados) que hoy tienen «Neón». */
  neonProductIds: string[];
  /** Productos activos que hoy tienen «Fluorescente». */
  fluorescentActiveProducts: number;
}

export interface RolloutInput {
  storeId: string;
  newBlueHex: string;
  newPurpleHex: string;
  expect: RolloutExpectations;
}

export interface ColorRow {
  id: string;
  name: string;
  value: string;
  swatchType: string;
  isArchived: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
}

export interface ProductRow {
  id: string;
  name: string;
  colorId: string;
  updatedAt: Date;
}

export interface RolloutPlan {
  problems: string[];
  /** Valores de antes de cada fila que se toca (para el registro y el rollback). */
  before: { colors: ColorRow[]; products: ProductRow[] };
  changes: {
    swatchTypes: { id: string; name: string; from: string; to: string }[];
    hex: { id: string; name: string; from: string; to: string }[];
    merge: { sourceId: string; targetId: string; productIds: string[] } | null;
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** `--blue-hex` y `--purple-hex`: obligatorios, `#rrggbb`. */
export function parseHexArg(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`falta ${flag} '#rrggbb' (sin valor por defecto: lo elige Paula)`);
  if (!HEX.test(value)) throw new Error(`${flag} debe ser #rrggbb, no «${value}»`);
  return value.toUpperCase();
}

const sameHex = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const COLOR_SELECT = {
  id: true,
  name: true,
  value: true,
  swatchType: true,
  isArchived: true,
  archivedAt: true,
  updatedAt: true,
} as const;

/** Lee la base, comprueba cada precondición y dice qué cambiaría. No escribe. */
export async function planColorRollout(db: Db, input: RolloutInput): Promise<RolloutPlan> {
  const { storeId, expect } = input;
  const problems: string[] = [];
  const colors = (await db.color.findMany({ where: { storeId }, select: COLOR_SELECT, orderBy: { name: "asc" } })) as ColorRow[];
  const byName = new Map(colors.map((color) => [normalizeColorName(color.name), color]));
  const find = (name: string) => byName.get(normalizeColorName(name));

  if (colors.length !== expect.colorCount) problems.push(`la tienda tiene ${colors.length} colores, no ${expect.colorCount}`);
  const notSolid = colors.filter((color) => color.swatchType !== "SOLID");
  if (notSolid.length > 0) {
    problems.push(`no todos los colores están en SOLID: ${notSolid.map((c) => `${c.name}=${c.swatchType}`).join(", ")}`);
  }

  const swatchTypes: RolloutPlan["changes"]["swatchTypes"] = [];
  const touched = new Map<string, ColorRow>();
  for (const [name, type] of Object.entries(COLOR_SWATCH_BACKFILL) as [string, string][]) {
    const color = find(name);
    if (!color) {
      problems.push(`no existe el color «${name}»`);
      continue;
    }
    touched.set(color.id, color);
    swatchTypes.push({ id: color.id, name: color.name, from: color.swatchType, to: type });
  }

  const hex: RolloutPlan["changes"]["hex"] = [];
  for (const [name, current, next] of [
    [BLUE_NAME, expect.blueHex, input.newBlueHex],
    [PURPLE_NAME, expect.purpleHex, input.newPurpleHex],
  ] as const) {
    const color = find(name);
    if (!color) continue; // ya reportado arriba: los dos están en el mapa del backfill
    if (!sameHex(color.value, current)) problems.push(`«${name}» tiene ${color.value}, no ${current}`);
    if (!HEX.test(next)) problems.push(`hex nuevo inválido para «${name}»: ${next}`);
    hex.push({ id: color.id, name: color.name, from: color.value, to: next });
  }

  const neon = find(NEON_NAME);
  const fluorescent = find(FLUORESCENT_NAME);
  let products: ProductRow[] = [];
  let merge: RolloutPlan["changes"]["merge"] = null;
  if (neon && fluorescent) {
    if (neon.isArchived) problems.push(`«${NEON_NAME}» ya está archivado`);
    if (fluorescent.isArchived) problems.push(`«${FLUORESCENT_NAME}» está archivado`);
    products = (await db.product.findMany({
      where: { storeId, colorId: neon.id },
      select: { id: true, name: true, colorId: true, updatedAt: true },
      orderBy: { id: "asc" },
    })) as ProductRow[];
    const actual = products.map((product) => product.id).sort();
    const expected = [...expect.neonProductIds].sort();
    if (actual.join(",") !== expected.join(",")) {
      problems.push(`«${NEON_NAME}» tiene ${actual.length} productos (${actual.join(", ") || "ninguno"}), no los ${expected.length} esperados`);
    }
    const fluorescentActive = await db.product.count({ where: { storeId, colorId: fluorescent.id, isArchived: false } });
    if (fluorescentActive !== expect.fluorescentActiveProducts) {
      problems.push(`«${FLUORESCENT_NAME}» tiene ${fluorescentActive} productos activos, no ${expect.fluorescentActiveProducts}`);
    }
    merge = { sourceId: neon.id, targetId: fluorescent.id, productIds: actual };
  }

  return {
    problems,
    before: { colors: Array.from(touched.values()).sort((a, b) => a.name.localeCompare(b.name, "es")), products },
    changes: { swatchTypes, hex, merge },
  };
}

export interface RolloutResult {
  swatchTypes: number;
  hex: number;
  moved: number;
  archived: number;
}

/**
 * Escribe todo dentro de la transacción que recibe. Vuelve a planear ahí
 * mismo, para que nada cambie entre la comprobación y la escritura, y lanza
 * (deshaciendo la transacción entera) ante cualquier precondición rota o
 * cualquier cuenta que no sea la esperada.
 */
export async function applyColorRollout(tx: Prisma.TransactionClient, input: RolloutInput, now = new Date()): Promise<RolloutResult> {
  const plan = await planColorRollout(tx, input);
  if (plan.problems.length > 0) throw new Error(`precondiciones rotas, no se escribió nada:\n- ${plan.problems.join("\n- ")}`);

  let swatchTypes = 0;
  for (const change of plan.changes.swatchTypes) {
    const { count } = await tx.color.updateMany({
      where: { id: change.id, storeId: input.storeId, swatchType: "SOLID" },
      data: { swatchType: change.to as never },
    });
    if (count !== 1) throw new Error(`swatchType de «${change.name}»: se esperaba 1 fila, fueron ${count}`);
    swatchTypes += count;
  }

  let hex = 0;
  for (const change of plan.changes.hex) {
    const { count } = await tx.color.updateMany({
      where: { id: change.id, storeId: input.storeId, value: change.from },
      data: { value: change.to },
    });
    if (count !== 1) throw new Error(`hex de «${change.name}»: se esperaba 1 fila, fueron ${count}`);
    hex += count;
  }

  const merge = plan.changes.merge!;
  const result = await mergeAttributes(tx, {
    storeId: input.storeId,
    input: { kind: "colors", sourceIds: [merge.sourceId], targetId: merge.targetId },
    now,
  });
  if (result.moved !== merge.productIds.length) {
    throw new Error(`la unión movió ${result.moved} productos, no ${merge.productIds.length}`);
  }
  const archived = await tx.color.count({ where: { id: merge.sourceId, isArchived: true } });
  if (archived !== 1) throw new Error(`«${NEON_NAME}» no quedó archivado`);

  return { swatchTypes, hex, moved: result.moved, archived };
}

const sqlString = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
/** DATETIME(3) en UTC, como lo guarda Prisma. */
const sqlDate = (value: Date | null) => (value ? sqlString(value.toISOString().replace("T", " ").replace("Z", "")) : "NULL");

/**
 * SQL que devuelve cada fila tocada a sus valores de antes, `updatedAt`
 * incluido. Se imprime y se anota en `ops/prod-writes.log` antes de escribir.
 */
export function rollbackSql(before: RolloutPlan["before"]): string[] {
  return [
    ...before.products.map(
      (product) =>
        `UPDATE \`Product\` SET \`colorId\` = ${sqlString(product.colorId)}, \`updatedAt\` = ${sqlDate(product.updatedAt)} WHERE \`id\` = ${sqlString(product.id)};`,
    ),
    ...before.colors.map(
      (color) =>
        `UPDATE \`Color\` SET \`swatchType\` = ${sqlString(color.swatchType)}, \`value\` = ${sqlString(color.value)}, \`isArchived\` = ${color.isArchived ? 1 : 0}, \`archivedAt\` = ${sqlDate(color.archivedAt)}, \`updatedAt\` = ${sqlDate(color.updatedAt)} WHERE \`id\` = ${sqlString(color.id)};`,
    ),
  ];
}
