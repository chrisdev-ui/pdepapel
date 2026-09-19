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

// ─── Valor hexadecimal de los colores ────────────────────────────────────────

/** `#RGB`, `#RRGGBB` o `#RRGGBBAA`, como lo guardan los colores existentes. */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Valor hexadecimal listo para guardar: sin espacios y en mayúsculas. `null`
 * cuando no es un color válido. Antes se guardaba tal cual («#8E44AD ») y el
 * espacio final llegaba a la tienda.
 */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : null;
}

export type HexColorIssue = "espacios" | "invalido";

/** Qué tiene de raro un valor ya guardado, para la pista de la lista. */
export function hexColorIssue(value: string | null | undefined): HexColorIssue | null {
  if (typeof value !== "string") return "invalido";
  if (value !== value.trim()) return "espacios";
  return HEX_COLOR_PATTERN.test(value) ? null : "invalido";
}

// ─── Nombres por corregir y parecidos ────────────────────────────────────────

export type TaxonomyNameIssue = "minuscula" | "espacios";

/** Problemas de forma de un nombre guardado: empieza en minúscula o trae espacios de más. */
export function taxonomyNameIssues(name: string | null | undefined): TaxonomyNameIssue[] {
  const issues: TaxonomyNameIssue[] = [];
  if (typeof name !== "string") return issues;
  const first = name.trim().charAt(0);
  if (first && first === first.toLowerCase() && first !== first.toUpperCase()) issues.push("minuscula");
  if (name !== cleanTaxonomyName(name)) issues.push("espacios");
  return issues;
}

/** Cómo quedaría el nombre al guardarlo: limpio y con mayúscula inicial. */
export function suggestedTaxonomyName(name: string | null | undefined): string {
  const clean = cleanTaxonomyName(name);
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export type TaxonomySimilarity = "igual" | "plural" | "prefijo" | "raiz";

export interface SimilarTaxonomyName<T> {
  row: T;
  reason: TaxonomySimilarity;
}

/** Formas que puede tener una palabra en singular o plural: «sobres» ↔ «sobre», «colores» ↔ «color». */
function wordForms(word: string): string[] {
  const forms = [word];
  if (word.length > 3 && word.endsWith("s")) forms.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith("es")) forms.push(word.slice(0, -2));
  return forms;
}

function sameWord(a: string, b: string): boolean {
  const formsA = wordForms(a);
  return wordForms(b).some((form) => formsA.includes(form));
}

function tokens(name: string): string[] {
  return normalizeTaxonomyName(name).split(" ").filter(Boolean);
}

/**
 * Parecido entre dos nombres distintos (ninguno es «igual» según
 * `isSameTaxonomyName`): mismo nombre en singular y plural («Cinta» /
 * «Cintas»), uno es el otro más palabras («Osito» / «Osito panda») o comparten
 * la raíz de la primera palabra («Rosa pastel» / «Rosado»). `null` cuando no
 * se parecen; es una pista para la persona, nunca un bloqueo.
 */
export function taxonomyNameSimilarity(a: string, b: string): TaxonomySimilarity | null {
  const wordsA = tokens(a);
  const wordsB = tokens(b);
  if (wordsA.length === 0 || wordsB.length === 0) return null;
  if (isSameTaxonomyName(a, b)) return "igual";
  const [short, long] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const prefixMatches = short.every((word, index) => sameWord(word, long[index]));
  if (prefixMatches) return short.length === long.length ? "plural" : "prefijo";
  const rootA = wordsA[0];
  const rootB = wordsB[0];
  const [shortRoot, longRoot] = rootA.length <= rootB.length ? [rootA, rootB] : [rootB, rootA];
  if (shortRoot.length >= 4 && longRoot.startsWith(shortRoot) && longRoot.length - shortRoot.length <= 3) return "raiz";
  return null;
}

/** Filas parecidas a un nombre, sin la fila que se edita; las «iguales» van primero. */
export function findSimilarTaxonomyNames<T extends { id: string; name: string }>(
  rows: readonly T[],
  name: string,
  excludeId?: string | null,
): SimilarTaxonomyName<T>[] {
  const order: Record<TaxonomySimilarity, number> = { igual: 0, plural: 1, prefijo: 2, raiz: 3 };
  return rows
    .filter((row) => row.id !== excludeId)
    .map((row) => ({ row, reason: taxonomyNameSimilarity(name, row.name) }))
    .filter((item): item is SimilarTaxonomyName<T> => item.reason !== null)
    .sort((a, b) => order[a.reason] - order[b.reason]);
}
