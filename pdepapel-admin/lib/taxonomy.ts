import { Prisma } from "@prisma/client";

import { AppError, ErrorFactory } from "@/lib/api-errors";

/**
 * Reglas compartidas de los atributos del catálogo (auditoría Grupo B, 2026-09).
 *
 * Vocabulario: el modelo Prisma `Type` es la **categoría** del panel y el
 * modelo `Category` es la **subcategoría**. Los helpers de este archivo son
 * puros (sin base de datos) para que las rutas y las pruebas compartan la
 * misma normalización de nombres y los mismos mensajes.
 */

export type TaxonomyEntity = "type" | "category" | "size" | "color" | "design";

export interface TaxonomyLabel {
  /** «categoría», «color»… */
  singular: string;
  plural: string;
  /** Artículo indefinido concordado: «una categoría», «un color». */
  indefinite: string;
  /** Participio de «llamado» concordado con el género. */
  named: string;
}

export const TAXONOMY_LABELS: Record<TaxonomyEntity, TaxonomyLabel> = {
  type: { singular: "categoría", plural: "categorías", indefinite: "una", named: "llamada" },
  category: { singular: "subcategoría", plural: "subcategorías", indefinite: "una", named: "llamada" },
  size: { singular: "tamaño", plural: "tamaños", indefinite: "un", named: "llamado" },
  color: { singular: "color", plural: "colores", indefinite: "un", named: "llamado" },
  design: { singular: "diseño", plural: "diseños", indefinite: "un", named: "llamado" },
};

/**
 * Forma canónica de un nombre para comparar duplicados: sin espacios en los
 * extremos, con los espacios internos colapsados, sin tildes ni diacríticos y
 * en minúsculas. «  Rojó » y «rojo» son el mismo nombre.
 */
export function normalizeTaxonomyName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Nombre limpio para guardar: recorta y colapsa espacios, conserva mayúsculas y tildes. */
export function cleanTaxonomyName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim();
}

export function isSameTaxonomyName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeTaxonomyName(a);
  return left.length > 0 && left === normalizeTaxonomyName(b);
}

/**
 * Busca entre las filas existentes una con el mismo nombre (sin distinguir
 * mayúsculas ni tildes), ignorando la fila que se está editando.
 */
export function findDuplicateTaxonomyName<T extends { id: string; name: string }>(
  rows: readonly T[],
  name: string,
  excludeId?: string | null,
): T | null {
  const wanted = normalizeTaxonomyName(name);
  if (!wanted) return null;
  return rows.find((row) => row.id !== excludeId && normalizeTaxonomyName(row.name) === wanted) ?? null;
}

export type TaxonomyScope = "store" | "type";

/** «Ya existe un color llamado «Rojo» en esta tienda.» */
export function duplicateTaxonomyMessage(entity: TaxonomyEntity, name: string, scope: TaxonomyScope = "store"): string {
  const label = TAXONOMY_LABELS[entity];
  const where = scope === "type" ? "en esta categoría" : "en esta tienda";
  return `Ya existe ${label.indefinite} ${label.singular} ${label.named} «${cleanTaxonomyName(name)}» ${where}.`;
}

export function duplicateTaxonomyError(entity: TaxonomyEntity, name: string, scope: TaxonomyScope = "store"): AppError {
  return ErrorFactory.Conflict(duplicateTaxonomyMessage(entity, name, scope), { entity, name: cleanTaxonomyName(name) });
}

/** `true` cuando Prisma rechazó la escritura por un índice único (P2002). */
export function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Convierte el P2002 del índice `@@unique([storeId, name])` en el mismo 409 en
 * español que devuelve la comprobación previa; cualquier otro error se
 * devuelve tal cual para que `handleErrorResponse` lo trate.
 */
export function mapTaxonomyUniqueError(error: unknown, entity: TaxonomyEntity, name: string, scope: TaxonomyScope = "store"): unknown {
  return isUniqueConstraintError(error) ? duplicateTaxonomyError(entity, name, scope) : error;
}

/** Mensaje 404 concordado: «El color no existe en esta tienda.» */
export function missingTaxonomyMessage(entity: TaxonomyEntity): string {
  const label = TAXONOMY_LABELS[entity];
  const article = label.indefinite === "una" ? "La" : "El";
  return `${article} ${label.singular} no existe en esta tienda.`;
}

/** Mensaje 400 concordado: «El nombre del color es obligatorio.» */
export function requiredTaxonomyFieldMessage(entity: TaxonomyEntity, field: "nombre" | "valor" | "ID"): string {
  const label = TAXONOMY_LABELS[entity];
  const of = label.indefinite === "una" ? "de la" : "del";
  return `El ${field} ${of} ${label.singular} es obligatorio.`;
}
