/**
 * Cómo se pinta la muestra de un color (issue #3). Puro y sin dependencias a
 * propósito: este archivo es BYTE A BYTE el mismo en `pdepapel-store` (la
 * muestra de la ficha y del filtro) y en `pdepapel-admin` (la vista previa
 * del formulario de color), y una prueba en la tienda los compara.
 *
 * NO EDITAR una copia sola: la prueba `color-swatch-parity` falla.
 *
 * El tipo viene de `Color.swatchType`, que elige Paula en el panel. Si no
 * llega (respuesta vieja en caché, despliegue a medias) o llega un valor que
 * este archivo no conoce, la muestra se pinta como SÓLIDO con el hex, igual
 * que antes del cambio. El tipo NUNCA se deduce del nombre.
 */

export const COLOR_SWATCH_TYPES = [
  "SOLID",
  "NEON",
  "METALLIC",
  "MULTICOLOR",
  "MULTICOLOR_PASTEL",
  "TRANSPARENT",
  "PATTERN",
] as const;

export type ColorSwatchType = (typeof COLOR_SWATCH_TYPES)[number];

export const COLOR_SWATCH_LABELS: Record<ColorSwatchType, string> = {
  SOLID: "Sólido",
  NEON: "Neón",
  METALLIC: "Metálico",
  MULTICOLOR: "Multicolor",
  MULTICOLOR_PASTEL: "Multicolor pastel",
  TRANSPARENT: "Transparente",
  PATTERN: "Patrón",
};

export function isColorSwatchType(value: unknown): value is ColorSwatchType {
  return typeof value === "string" && (COLOR_SWATCH_TYPES as readonly string[]).includes(value);
}

/** Sin tipo o con un tipo desconocido: sólido (el hex, como siempre). */
export function resolveSwatchType(value: unknown): ColorSwatchType {
  return isColorSwatchType(value) ? value : "SOLID";
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RGB`, `#RRGGBB` o `#RRGGBBAA` (el alfa se ignora); cualquier otra cosa → `null`. */
export function parseHexColor(value: string | null | undefined): Rgb | null {
  const hex = String(value ?? "").trim().replace(/^#/, "");
  const full =
    /^[0-9a-f]{3}$/i.test(hex)
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)
        ? hex.slice(0, 6)
        : null;
  if (!full) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/** Mezcla lineal en sRGB, como `color-mix(in srgb, a weight, b)`, pero calculada aquí para no depender del navegador. */
const mix = (a: Rgb, b: Rgb, weightOfA: number): Rgb => ({
  r: a.r * weightOfA + b.r * (1 - weightOfA),
  g: a.g * weightOfA + b.g * (1 - weightOfA),
  b: a.b * weightOfA + b.b * (1 - weightOfA),
});

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

function relativeLuminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b]
    .map((channel) => channel / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Contraste WCAG del color contra blanco (1 a 21); `null` si el hex no es válido. */
export function contrastAgainstWhite(value: string | null | undefined): number | null {
  const rgb = parseHexColor(value);
  return rgb ? 1.05 / (relativeLuminance(rgb) + 0.05) : null;
}

/** Por debajo de 3:1 (WCAG 1.4.11, objetos gráficos) la muestra lleva borde reforzado. */
export const LIGHT_SWATCH_CONTRAST = 3;

const isWhite = (rgb: Rgb | null) => Boolean(rgb && rgb.r === 255 && rgb.g === 255 && rgb.b === 255);

const RING = "inset 0 0 0 1px rgba(15, 23, 42, 0.14)";
const LIGHT_RING = "inset 0 0 0 1.5px rgba(15, 23, 42, 0.38)";

const RAINBOW =
  "conic-gradient(from 200deg, #ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)";
const PASTEL_RAINBOW = "conic-gradient(from 200deg, #fbcfe8, #fde68a, #bbf7d0, #bae6fd, #ddd6fe, #fbcfe8)";
/** Surtido fluorescente: franjas duras (no degradado) para no confundirse con el arcoíris de Multicolor. */
const NEON_STRIPES = "linear-gradient(90deg, #ff2fd0 0 34%, #f5ff00 34% 66%, #39ff14 66% 100%)";
/** Surtido metálico: plata, oro y oro rosa. */
const METALLIC_MIX =
  "conic-gradient(from 210deg, #f5f5f5, #b8b8b8, #ffd700, #b8860b, #f4c2c2, #b76e79, #f5f5f5)";
const GLASS =
  "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 38%, rgba(255, 255, 255, 0) 62%, rgba(255, 255, 255, 0.7) 100%)";
const CHECKER = "repeating-conic-gradient(#d1d5db 0% 25%, #ffffff 0% 50%)";

/**
 * La «pintura» de una muestra. `backgroundColor` va siempre (es el respaldo
 * sólido: un navegador que no entienda el degradado descarta solo
 * `backgroundImage` y conserva el tono). `ring` es el borde interior;
 * `glowColor` el halo de los neones (el componente decide su tamaño).
 */
export interface SwatchPaint {
  type: ColorSwatchType;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  ring: string;
  glowColor?: string;
  /** Surtido: el hex guardado es blanco y significa «varios tonos». */
  assorted: boolean;
  /** Hex inválido en un tipo que lo necesita: gris con «?». */
  unknown: boolean;
}

const UNKNOWN_PAINT = (type: ColorSwatchType): SwatchPaint => ({
  type,
  backgroundColor: "#f3f4f6",
  ring: LIGHT_RING,
  assorted: false,
  unknown: true,
});

export function getSwatchPaint(swatchType: unknown, value: string | null | undefined): SwatchPaint {
  const type = resolveSwatchType(swatchType);
  const rgb = parseHexColor(value);
  const hex = rgb ? toHex(rgb) : null;

  switch (type) {
    case "MULTICOLOR":
      return { type, backgroundColor: "#f59e0b", backgroundImage: RAINBOW, ring: RING, assorted: false, unknown: false };
    case "MULTICOLOR_PASTEL":
      return { type, backgroundColor: "#fde68a", backgroundImage: PASTEL_RAINBOW, ring: LIGHT_RING, assorted: false, unknown: false };
    case "TRANSPARENT":
      return {
        type,
        backgroundColor: "#ffffff",
        backgroundImage: `${GLASS}, ${CHECKER}`,
        backgroundSize: "100% 100%, 10px 10px",
        backgroundPosition: "0 0, 50% 50%",
        ring: LIGHT_RING,
        assorted: false,
        unknown: false,
      };
    case "NEON":
      if (!rgb || isWhite(rgb)) {
        return { type, backgroundColor: "#f5ff00", backgroundImage: NEON_STRIPES, ring: RING, glowColor: "rgba(255, 47, 208, 0.55)", assorted: true, unknown: false };
      }
      return {
        type,
        backgroundColor: hex!,
        backgroundImage: `radial-gradient(circle at 35% 30%, ${toHex(mix(rgb, WHITE, 0.6))} 0%, ${hex} 55%)`,
        ring: RING,
        glowColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`,
        assorted: false,
        unknown: false,
      };
    case "METALLIC":
      if (!rgb || isWhite(rgb)) {
        return { type, backgroundColor: "#c0c0c0", backgroundImage: METALLIC_MIX, ring: LIGHT_RING, assorted: true, unknown: false };
      }
      return {
        type,
        backgroundColor: hex!,
        backgroundImage: `linear-gradient(135deg, #ffffff 0%, ${hex} 30%, ${toHex(mix(rgb, BLACK, 0.55))} 55%, ${hex} 75%, #ffffff 100%)`,
        ring: LIGHT_RING,
        assorted: false,
        unknown: false,
      };
    case "PATTERN":
      if (!rgb) return UNKNOWN_PAINT(type);
      return {
        type,
        backgroundColor: "#ffffff",
        backgroundImage: `repeating-linear-gradient(45deg, ${hex} 0 5px, #ffffff 5px 10px)`,
        ring: LIGHT_RING,
        assorted: false,
        unknown: false,
      };
    case "SOLID":
    default: {
      if (!rgb) return UNKNOWN_PAINT("SOLID");
      const contrast = contrastAgainstWhite(hex);
      return {
        type: "SOLID",
        backgroundColor: hex!,
        ring: contrast !== null && contrast < LIGHT_SWATCH_CONTRAST ? LIGHT_RING : RING,
        assorted: false,
        unknown: false,
      };
    }
  }
}
