import type { AttributeKind } from "@/lib/attribute-archive";
import { findSimilarTaxonomyNames, hexColorIssue, normalizeHexColor, taxonomyNameIssues } from "@/lib/taxonomy";

/**
 * Pistas de limpieza de la lista de Atributos (auditoría 2026-09-19): qué
 * tiene de raro cada fila para verlo junto al nombre y filtrar por ello.
 * Todo es puro y se calcula en el cliente con las filas ya cargadas.
 */

export type AttributeHintKind =
  | "repetido"
  | "parecido"
  | "sin-productos"
  | "sin-subcategorias"
  | "nombre"
  | "valor"
  | "mismo-tono"
  | "sin-icono";

export type AttributeHintTone = "cream" | "pink" | "slate";

export interface AttributeHint {
  kind: AttributeHintKind;
  label: string;
  tone: AttributeHintTone;
  /** Fila con la que se parece o repite, para el enlace. */
  relatedId?: string;
}

export interface AttributeHintInput {
  id: string;
  name: string;
  isArchived: boolean;
  /** Productos (o subcategorías, en categorías) que lo usan. */
  usage: number;
  /** Solo colores. */
  value?: string | null;
  /** Solo categorías. */
  icon?: string | null;
  iconSvg?: string | null;
}

/** Opciones del filtro «Revisar» por familia; el valor es la pista que buscan. */
export const ATTRIBUTE_FILTER_OPTIONS: Record<AttributeKind, { value: AttributeHintKind; label: string }[]> = {
  types: [
    { value: "sin-subcategorias", label: "Sin subcategorías" },
    { value: "sin-icono", label: "Sin icono" },
    { value: "parecido", label: "Posibles repetidos" },
    { value: "nombre", label: "Nombre por corregir" },
  ],
  categories: [
    { value: "sin-productos", label: "Sin productos" },
    { value: "parecido", label: "Posibles repetidos" },
    { value: "nombre", label: "Nombre por corregir" },
  ],
  sizes: [{ value: "sin-productos", label: "Sin productos" }],
  colors: [
    { value: "sin-productos", label: "Sin productos" },
    { value: "parecido", label: "Posibles repetidos" },
    { value: "mismo-tono", label: "Mismo tono" },
    { value: "valor", label: "Valor por corregir" },
    { value: "nombre", label: "Nombre por corregir" },
  ],
  designs: [
    { value: "sin-productos", label: "Sin productos" },
    { value: "parecido", label: "Posibles repetidos" },
    { value: "nombre", label: "Nombre por corregir" },
  ],
};

/** Una pista «repetido» también cuenta como «parecido» al filtrar. */
export function hintMatchesFilter(hints: readonly AttributeHint[], wanted: readonly string[]): boolean {
  return hints.some((hint) => wanted.includes(hint.kind) || (hint.kind === "repetido" && wanted.includes("parecido")));
}

/**
 * Pistas de todas las filas de una familia. Los parecidos y el mismo tono se
 * buscan solo entre filas activas: una archivada ya no compite.
 */
export function computeAttributeHints(kind: AttributeKind, rows: readonly AttributeHintInput[]): Map<string, AttributeHint[]> {
  const active = rows.filter((row) => !row.isArchived);
  const byHex = new Map<string, number>();
  if (kind === "colors") {
    for (const row of active) {
      const hex = normalizeHexColor(row.value);
      if (hex) byHex.set(hex, (byHex.get(hex) ?? 0) + 1);
    }
  }
  const result = new Map<string, AttributeHint[]>();
  for (const row of rows) {
    const hints: AttributeHint[] = [];
    if (!row.isArchived) {
      const similar = findSimilarTaxonomyNames(active, row.name, row.id);
      const twin = similar.find((item) => item.reason === "igual");
      const alike = similar.find((item) => item.reason !== "igual");
      if (twin) hints.push({ kind: "repetido", label: `Repetido con «${twin.row.name}»`, tone: "pink", relatedId: twin.row.id });
      else if (alike) hints.push({ kind: "parecido", label: `Parecido a «${alike.row.name}»`, tone: "cream", relatedId: alike.row.id });
    }
    if (kind === "colors") {
      const issue = hexColorIssue(row.value);
      if (issue) hints.push({ kind: "valor", label: issue === "espacios" ? "Valor con espacio al final" : "Valor no válido", tone: "pink" });
      const hex = normalizeHexColor(row.value);
      const twins = hex && !row.isArchived ? (byHex.get(hex) ?? 1) - 1 : 0;
      if (twins > 0) hints.push({ kind: "mismo-tono", label: `Mismo tono que ${twins} más`, tone: "cream" });
    }
    if (taxonomyNameIssues(row.name).length > 0) hints.push({ kind: "nombre", label: "Nombre por corregir", tone: "cream" });
    if (kind === "types") {
      if (row.usage === 0) hints.push({ kind: "sin-subcategorias", label: "Sin subcategorías", tone: "slate" });
      if (!row.icon && !row.iconSvg) hints.push({ kind: "sin-icono", label: "Sin icono", tone: "slate" });
    } else if (row.usage === 0) {
      hints.push({ kind: "sin-productos", label: "Sin productos", tone: "slate" });
    }
    result.set(row.id, hints);
  }
  return result;
}

/** Proporción de uso frente a la fila más usada, para la barra de la columna Productos. */
export function usageShare(usage: number, max: number): number {
  if (max <= 0 || usage <= 0) return 0;
  return Math.max(2, Math.round((usage / max) * 100));
}
