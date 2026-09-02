import { createHash } from "node:crypto";

export { normalizeCatalogOptionKey } from "@/lib/catalog-option-key";

export type CatalogAttributeSuggestion = {
  key: string;
  name: string;
  value: string;
  confidence: number;
  evidence: string;
};

export type ShippingProfileSuggestion = {
  code: string;
  name: string;
  dimensionCode: string | null;
  weightCode: string | null;
};

const LEADING_ICON_PATTERN =
  /^([^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9].+)$/;

const OPTION_PATTERNS: Array<{
  key: string;
  name: string;
  pattern: RegExp;
  format?: (value: string) => string;
}> = [
  {
    key: "formato",
    name: "Formato",
    pattern: /\b(A[3-7])\b/i,
    format: (value) => value.toUpperCase(),
  },
  {
    key: "capacidad",
    name: "Capacidad",
    pattern: /\b(\d+(?:[.,]\d+)?\s?(?:ml|l))\b/i,
    format: normalizeMeasurement,
  },
  {
    key: "medida",
    name: "Medida",
    pattern: /\b(\d+(?:[.,]\d+)?\s?(?:mm|cm|m))\b/i,
    format: normalizeMeasurement,
  },
  {
    key: "cantidad",
    name: "Cantidad",
    pattern:
      /\b(?:x\s*)?(\d+\s?(?:unidades?|hojas?|piezas?|colores?|rollos?))\b/i,
    format: normalizeWhitespace,
  },
  {
    key: "punta",
    name: "Punta",
    pattern: /\b(punta\s+(?:fina|media|gruesa|pincel|biselada))\b/i,
    format: sentenceCase,
  },
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string) {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase("es-CO");
  return normalized.charAt(0).toLocaleUpperCase("es-CO") + normalized.slice(1);
}

function normalizeMeasurement(value: string) {
  return normalizeWhitespace(value)
    .replace(",", ".")
    .replace(/\s*(mm|cm|ml|l|m)$/i, " $1")
    .replace(/\s+l$/i, " L");
}

export function splitTaxonomyIcon(value: string) {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(LEADING_ICON_PATTERN);

  if (!match) {
    return { icon: null, name: normalized };
  }

  const name = normalizeWhitespace(match[2]);
  const icon = normalizeWhitespace(match[1]);

  return name ? { icon, name } : { icon: null, name: normalized };
}

export function buildShippingProfileSuggestion(input: {
  name: string;
  value: string;
}): ShippingProfileSuggestion {
  const code = input.value.trim().toUpperCase();
  const [dimensionCode, weightCode] = code.split("-", 2);

  return {
    code,
    name: normalizeWhitespace(input.name) || code,
    dimensionCode: dimensionCode || null,
    weightCode: weightCode || null,
  };
}

export function inferCatalogAttributes(name: string) {
  const suggestions = new Map<string, CatalogAttributeSuggestion>();

  for (const option of OPTION_PATTERNS) {
    const match = name.match(option.pattern);
    const matchedValue = match?.[1];
    if (!matchedValue) continue;

    const value = option.format
      ? option.format(matchedValue)
      : normalizeWhitespace(matchedValue);
    suggestions.set(option.key, {
      key: option.key,
      name: option.name,
      value,
      confidence: 0.98,
      evidence: `Detectado en el nombre actual: “${matchedValue}”`,
    });
  }

  return Array.from(suggestions.values());
}

export function getCatalogMigrationFingerprint(input: {
  productId: string;
  productUpdatedAt: Date | string;
  version?: number;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        productId: input.productId,
        productUpdatedAt: new Date(input.productUpdatedAt).toISOString(),
        version: input.version ?? 1,
      }),
    )
    .digest("hex");
}
