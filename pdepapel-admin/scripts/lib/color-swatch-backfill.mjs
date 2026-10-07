/**
 * Mapa único (nombre de color → tipo de muestra) para el backfill de
 * `Color.swatchType` (issue #3, auditoría 2026-10-06 §1).
 *
 * Son los 13 colores no sólidos que había en producción el 2026-10-06, con su
 * nombre exacto. No es una regla de nombres: un color nuevo llamado
 * «Rosa neón» NO entra solo; su tipo lo elige Paula en el panel («Tipo de
 * muestra»). Por eso es una lista cerrada y no una expresión regular, y por
 * eso ni la tienda ni el panel derivan el tipo del nombre en ningún otro
 * sitio (sin campo, la tienda pinta el hex como sólido).
 *
 * Puro y sin dependencias: lo usan `scripts/backfill-color-swatch-type.mjs` y
 * su prueba (`tests/unit/scripts/color-swatch-backfill.test.ts`).
 */

export const COLOR_SWATCH_TYPES = Object.freeze([
  "SOLID",
  "NEON",
  "METALLIC",
  "MULTICOLOR",
  "MULTICOLOR_PASTEL",
  "TRANSPARENT",
  "PATTERN",
]);

/** Nombre guardado → tipo. El resto de colores se queda en SOLID (el valor por defecto). */
export const COLOR_SWATCH_BACKFILL = Object.freeze({
  Multicolor: "MULTICOLOR",
  Pastel: "MULTICOLOR_PASTEL",
  Transparente: "TRANSPARENT",
  Metalizado: "METALLIC",
  Plateado: "METALLIC",
  Dorado: "METALLIC",
  Fluorescente: "NEON",
  "Neón": "NEON",
  "Verde fluorescente": "NEON",
  "Rosado fluorescente": "NEON",
  "Naranja fluorescente": "NEON",
  "Azul fluorescente": "NEON",
  "Morado fluorescente": "NEON",
});

/** Misma comparación que el panel usa para nombres de atributo: sin espacios al borde, NFC y sin mayúsculas. */
export function normalizeColorName(name) {
  return String(name ?? "")
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("es");
}

const BY_NORMALIZED_NAME = new Map(
  Object.entries(COLOR_SWATCH_BACKFILL).map(([name, type]) => [normalizeColorName(name), { name, type }]),
);

/** Tipo que el backfill asigna a un nombre guardado, o `null` si ese color no se toca. */
export function backfillSwatchTypeFor(name) {
  return BY_NORMALIZED_NAME.get(normalizeColorName(name))?.type ?? null;
}

/**
 * Plan del backfill sobre las filas actuales de UNA tienda
 * (`{ id, name, swatchType }`).
 *
 * - `changes`: filas cuyo tipo actual no es el del mapa (las que se escriben).
 * - `alreadySet`: filas del mapa que ya tienen su tipo (idempotencia: no se tocan).
 * - `missing`: nombres del mapa que la tienda no tiene (aviso, no error).
 *
 * Nunca baja un color a SOLID: si Paula ya eligió un tipo distinto para un
 * color que no está en el mapa, se respeta.
 */
export function planColorSwatchBackfill(colors) {
  const changes = [];
  const alreadySet = [];
  const seen = new Set();
  for (const color of colors) {
    const entry = BY_NORMALIZED_NAME.get(normalizeColorName(color.name));
    if (!entry) continue;
    seen.add(entry.name);
    if (color.swatchType === entry.type) alreadySet.push({ id: color.id, name: color.name, type: entry.type });
    else changes.push({ id: color.id, name: color.name, from: color.swatchType ?? null, to: entry.type });
  }
  const missing = Object.keys(COLOR_SWATCH_BACKFILL).filter((name) => !seen.has(name));
  changes.sort((a, b) => a.name.localeCompare(b.name, "es"));
  alreadySet.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { changes, alreadySet, missing };
}
